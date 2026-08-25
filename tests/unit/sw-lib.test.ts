// The service worker's decision logic (public/sw-lib.js) — the code that
// decides whether an OS banner is shown for a push. A regression here is
// exactly the "employees don't get the notification sound" bug.

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const swLib = require("../../public/sw-lib.js") as {
  CACHE_NAMES: { sound: string; static: string; assets: string; navigation: string };
  parsePushPayload: (raw: string | null | undefined) => {
    title: string;
    body: string;
    url: string;
    badge: number | null;
    tag: string | null;
    icon: string | null;
  } | null;
  shouldShowPushNotification: (
    clients: { focused?: boolean; visibilityState?: string }[] | null,
  ) => boolean;
  notificationOptionsFor: (data: Record<string, unknown>) => Record<string, unknown>;
  classifyRequest: (
    req: {
      method?: string;
      url: string;
      cache?: string;
      mode?: string;
      headers?: Record<string, string> | { get: (name: string) => string | null };
    },
    selfOrigin?: string,
  ) => "sound" | "static" | "asset" | "navigation" | null;
  isCacheableResponse: (
    res: { ok?: boolean; status?: number; redirected?: boolean; type?: string } | null,
    strategy?: string,
  ) => boolean;
  knownCacheNames: () => string[];
};

const ORIGIN = "https://app.nizek.test";

function req(
  url: string,
  init: {
    method?: string;
    cache?: string;
    mode?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return {
    method: init.method ?? "GET",
    url,
    cache: init.cache,
    mode: init.mode,
    headers: init.headers ?? {},
  };
}

describe("parsePushPayload", () => {
  it("parses a full payload", () => {
    const raw = JSON.stringify({
      title: "Ali",
      body: "hello",
      url: "/dashboard/messages/conv-1",
      badge: 3,
      tag: "thread-conv-1",
      icon: "/avatar.png",
    });
    expect(swLib.parsePushPayload(raw)).toEqual({
      title: "Ali",
      body: "hello",
      url: "/dashboard/messages/conv-1",
      badge: 3,
      tag: "thread-conv-1",
      icon: "/avatar.png",
    });
  });

  it("defaults missing fields", () => {
    const parsed = swLib.parsePushPayload(JSON.stringify({ title: "T" }));
    expect(parsed).toEqual({
      title: "T",
      body: "",
      url: "/dashboard",
      badge: null,
      tag: null,
      icon: null,
    });
  });

  it("rejects garbage", () => {
    expect(swLib.parsePushPayload("not json")).toBeNull();
    expect(swLib.parsePushPayload("")).toBeNull();
    expect(swLib.parsePushPayload(null)).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify({ body: "no title" }))).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify(null))).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify("string"))).toBeNull();
  });
});

describe("shouldShowPushNotification (WhatsApp behavior)", () => {
  it("shows when there are no clients (app closed)", () => {
    expect(swLib.shouldShowPushNotification([])).toBe(true);
  });

  it("shows when a tab exists but is hidden (backgrounded/minimized)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "hidden" },
      ]),
    ).toBe(true);
  });

  it("shows when a tab is visible but NOT focused (app behind another window)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "visible" },
      ]),
    ).toBe(true);
  });

  it("suppresses ONLY when a tab is focused and visible (user is looking)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: true, visibilityState: "visible" },
      ]),
    ).toBe(false);
  });

  it("suppresses when any of several tabs is focused-visible", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "hidden" },
        { focused: true, visibilityState: "visible" },
      ]),
    ).toBe(false);
  });

  it("shows on malformed input (fail open — never lose a notification)", () => {
    expect(swLib.shouldShowPushNotification(null)).toBe(true);
  });
});

describe("notificationOptionsFor", () => {
  it("builds options with tag-based renotify and audible banner", () => {
    const opts = swLib.notificationOptionsFor({
      body: "hi",
      url: "/x",
      tag: "thread-conv-1",
    });
    expect(opts.tag).toBe("thread-conv-1");
    expect(opts.renotify).toBe(true);
    expect(opts.silent).toBe(false);
    expect((opts.data as { url: string }).url).toBe("/x");
  });

  it("omits renotify without a tag", () => {
    const opts = swLib.notificationOptionsFor({ body: "hi" });
    expect(opts.tag).toBeUndefined();
    expect(opts.renotify).toBe(false);
  });
});

describe("classifyRequest (PWA cache strategy)", () => {
  it("keeps notification-sound URLs as cache-first sound, including cross-origin", () => {
    expect(
      swLib.classifyRequest(
        req("https://cdn.example.com/files/notification_sound/chime.mp3"),
        ORIGIN,
      ),
    ).toBe("sound");
  });

  it("skips range requests for notification sounds", () => {
    expect(
      swLib.classifyRequest(
        req(`${ORIGIN}/notification_sound/a.mp3`, { headers: { Range: "bytes=0-1" } }),
        ORIGIN,
      ),
    ).toBeNull();
  });

  it("cache-firsts hashed Next static assets", () => {
    expect(
      swLib.classifyRequest(req(`${ORIGIN}/_next/static/chunks/app-123.js`), ORIGIN),
    ).toBe("static");
  });

  it("uses stale-while-revalidate for icons, images, and the manifest", () => {
    expect(swLib.classifyRequest(req(`${ORIGIN}/manifest.json`), ORIGIN)).toBe("asset");
    expect(swLib.classifyRequest(req(`${ORIGIN}/favicon.ico`), ORIGIN)).toBe("asset");
    expect(swLib.classifyRequest(req(`${ORIGIN}/pwa-icons/v1/icon-192.png`), ORIGIN)).toBe(
      "asset",
    );
    expect(swLib.classifyRequest(req(`${ORIGIN}/logo.svg`), ORIGIN)).toBe("asset");
  });

  it("network-firsts dashboard document and RSC navigations", () => {
    expect(
      swLib.classifyRequest(
        req(`${ORIGIN}/dashboard`, {
          mode: "navigate",
          headers: { "Sec-Fetch-Dest": "document", Accept: "text/html" },
        }),
        ORIGIN,
      ),
    ).toBe("navigation");
    expect(
      swLib.classifyRequest(
        req(`${ORIGIN}/dashboard/projects?_rsc=abc`, { headers: { RSC: "1" } }),
        ORIGIN,
      ),
    ).toBe("navigation");
  });

  it("does not intercept mutations, server actions, auth, APIs, or uploads", () => {
    expect(
      swLib.classifyRequest(req(`${ORIGIN}/dashboard`, { method: "POST" }), ORIGIN),
    ).toBeNull();
    expect(
      swLib.classifyRequest(
        req(`${ORIGIN}/dashboard`, { method: "PUT" }),
        ORIGIN,
      ),
    ).toBeNull();
    expect(
      swLib.classifyRequest(
        req(`${ORIGIN}/dashboard`, { headers: { "Next-Action": "abc" } }),
        ORIGIN,
      ),
    ).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/api/auth/session`), ORIGIN)).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/api/version`), ORIGIN)).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/api/push`), ORIGIN)).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/api/upload/presign`), ORIGIN)).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/sign-in`), ORIGIN)).toBeNull();
    expect(
      swLib.classifyRequest(req(`${ORIGIN}/favicon.ico`, { cache: "no-store" }), ORIGIN),
    ).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/sw.js`), ORIGIN)).toBeNull();
    expect(swLib.classifyRequest(req(`${ORIGIN}/_next/image?url=/x`), ORIGIN)).toBeNull();
  });

  it("does not intercept cross-origin app requests", () => {
    expect(
      swLib.classifyRequest(req("https://other.test/_next/static/a.js"), ORIGIN),
    ).toBeNull();
  });
});

describe("isCacheableResponse", () => {
  it("rejects redirects, errors, and partial content", () => {
    expect(swLib.isCacheableResponse({ ok: true, redirected: true, type: "basic" })).toBe(
      false,
    );
    expect(swLib.isCacheableResponse({ ok: false, status: 401, type: "basic" })).toBe(
      false,
    );
    expect(swLib.isCacheableResponse({ ok: true, status: 206, type: "basic" })).toBe(
      false,
    );
  });

  it("accepts basic 200s and opaque sound responses", () => {
    expect(swLib.isCacheableResponse({ ok: true, status: 200, type: "basic" })).toBe(true);
    expect(
      swLib.isCacheableResponse({ ok: false, status: 0, type: "opaque" }, "sound"),
    ).toBe(true);
  });
});

describe("knownCacheNames", () => {
  it("keeps the notification-sound cache name stable", () => {
    expect(swLib.CACHE_NAMES.sound).toBe("notif-sound-v1");
    expect(swLib.knownCacheNames()).toContain("notif-sound-v1");
  });
});
