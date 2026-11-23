import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafePreviewUrl,
  isPrivateOrReservedIp,
  LruTtlCache,
  readLimitedText,
  safeFetchWithRedirects,
  UnsafeUrlError,
} from "@/lib/link-preview-guard";

describe("isPrivateOrReservedIp", () => {
  it("blocks private, loopback, link-local, CGNAT, and reserved IPv4 addresses", () => {
    const blocked = [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const ip of blocked) {
      expect(isPrivateOrReservedIp(ip), `expected ${ip} blocked`).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "100.63.255.255"];
    for (const ip of allowed) {
      expect(isPrivateOrReservedIp(ip), `expected ${ip} allowed`).toBe(false);
    }
  });

  it("blocks private, loopback, ULA, link-local, and IPv4-mapped private IPv6 addresses", () => {
    const blocked = [
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.5",
      "::ffff:7f00:1",
      "fc00::1",
      "fd12:3456:789a::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
    ];
    for (const ip of blocked) {
      expect(isPrivateOrReservedIp(ip), `expected ${ip} blocked`).toBe(true);
    }
  });

  it("allows public IPv6 and IPv4-mapped public IPv6 addresses", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:1.1.1.1")).toBe(false);
  });
});

describe("assertSafePreviewUrl", () => {
  it("rejects non-http protocols, credentials, localhost, and internal suffixes", async () => {
    const resolve = async () => ["93.184.216.34"];
    const bad = [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ftp://example.com/file",
      "https://user:pass@example.com/",
      "http://localhost:3000/",
      "http://api.localhost/",
      "http://postgres.railway.internal/",
      "http://printer.local/",
      "http://127.0.0.1:8010/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]:3000/",
    ];
    for (const url of bad) {
      await expect(assertSafePreviewUrl(url, resolve), `expected ${url} rejected`).rejects.toThrow(
        UnsafeUrlError,
      );
    }
  });

  it("rejects hostnames if any resolved DNS record is private", async () => {
    const mixedDns = async () => ["93.184.216.34", "10.0.0.2"];
    await expect(assertSafePreviewUrl("https://evil.example/", mixedDns)).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("accepts public hostnames whose DNS records are all public", async () => {
    const publicDns = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
    const url = await assertSafePreviewUrl("https://example.com/post", publicDns);
    expect(url.toString()).toBe("https://example.com/post");
  });
});

describe("safeFetchWithRedirects", () => {
  it("blocks a redirect to a private address", async () => {
    const resolve = async () => ["93.184.216.34"];
    const fakeFetch = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      });

    await expect(
      safeFetchWithRedirects(new URL("https://example.com/go"), {
        headers: {},
        signal: new AbortController().signal,
        resolveHost: resolve,
        fetchImpl: fakeFetch as typeof fetch,
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it("follows safe redirects up to maxRedirects and rejects loops", async () => {
    const resolve = async () => ["93.184.216.34"];
    let calls = 0;
    const fakeFetch = async (input: string | URL | Request) => {
      calls++;
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/step1")) {
        return new Response(null, { status: 301, headers: { location: "/step2" } });
      }
      return new Response("<title>Done</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const { res, finalUrl } = await safeFetchWithRedirects(new URL("https://example.com/step1"), {
      headers: {},
      signal: new AbortController().signal,
      resolveHost: resolve,
      fetchImpl: fakeFetch as typeof fetch,
    });
    expect(calls).toBe(2);
    expect(res.status).toBe(200);
    expect(finalUrl.toString()).toBe("https://example.com/step2");

    const loopFetch = async () =>
      new Response(null, { status: 302, headers: { location: "https://example.com/loop" } });
    await expect(
      safeFetchWithRedirects(new URL("https://example.com/loop"), {
        headers: {},
        signal: new AbortController().signal,
        maxRedirects: 2,
        resolveHost: resolve,
        fetchImpl: loopFetch as typeof fetch,
      }),
    ).rejects.toThrow("Too many redirects");
  });
});

describe("readLimitedText", () => {
  it("caps response reading at maxBytes without reading the rest of the stream", async () => {
    let chunksPulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled++;
        if (chunksPulled > 100) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode("abcdefghij"));
      },
    });
    const res = new Response(stream);
    const text = await readLimitedText(res, 25);
    expect(text.length).toBe(25);
    expect(chunksPulled).toBeLessThanOrEqual(4);
  });
});

describe("LruTtlCache", () => {
  it("bounds size with LRU eviction and respects TTL", () => {
    const cache = new LruTtlCache<string>(3, 1000);
    cache.set("a", "1", 0);
    cache.set("b", "2", 0);
    cache.set("c", "3", 0);
    expect(cache.get("a", 10)).toBe("1"); // "a" becomes most-recently used
    cache.set("d", "4", 20); // evicts "b"
    expect(cache.size).toBe(3);
    expect(cache.get("b", 20)).toBeUndefined();
    expect(cache.get("a", 20)).toBe("1");
    expect(cache.get("a", 1000)).toBeUndefined(); // expired
  });
});

describe("centrifugo/config.json", () => {
  it("disables client publishing on all channel namespaces", () => {
    const raw = readFileSync(path.resolve(process.cwd(), "centrifugo/config.json"), "utf8");
    const cfg = JSON.parse(raw) as {
      channel: { namespaces: Array<{ name: string; allow_publish_for_subscriber?: boolean }> };
    };
    for (const ns of cfg.channel.namespaces) {
      expect(ns.allow_publish_for_subscriber, `namespace ${ns.name} allows client publish`).not.toBe(
        true,
      );
    }
  });
});
