// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  applyDocumentLogos,
  logosEqual,
  parseLiveLogos,
} from "@/lib/live-branding";

describe("parseLiveLogos", () => {
  it("reads the logos object from /api/version", () => {
    expect(
      parseLiveLogos({
        version: "abc.s0",
        logos: {
          favicon: "/pwa-icons/1/favicon.ico",
          faviconDark: "/pwa-icons/1/favicon-dark.ico",
          appleTouchIcon: "/pwa-icons/1/apple-touch-icon.png",
          webLogo: "https://cdn/w.svg?v=1",
          iosSplash: null,
          manifest: "/manifest.json?v=9",
          iconToken: "9",
        },
      }),
    ).toEqual({
      favicon: "/pwa-icons/1/favicon.ico",
      faviconDark: "/pwa-icons/1/favicon-dark.ico",
      appleTouchIcon: "/pwa-icons/1/apple-touch-icon.png",
      webLogo: "https://cdn/w.svg?v=1",
      iosSplash: null,
      manifest: "/manifest.json?v=9",
      iconToken: "9",
    });
  });

  it("falls back to the legacy logo field during a rolling deploy", () => {
    expect(parseLiveLogos({ logo: "https://cdn/old.png" })).toEqual({
      favicon: "https://cdn/old.png",
      faviconDark: null,
      appleTouchIcon: null,
      webLogo: null,
      iosSplash: null,
      manifest: null,
      iconToken: null,
    });
  });

  it("derives iconToken from the manifest query when omitted", () => {
    expect(
      parseLiveLogos({
        logos: { manifest: "/manifest.json?v=42" },
      })?.iconToken,
    ).toBe("42");
  });

  it("rejects junk", () => {
    expect(parseLiveLogos(null)).toBeNull();
    expect(parseLiveLogos({})).toBeNull();
  });
});

describe("logosEqual", () => {
  it("compares each slot", () => {
    const a = parseLiveLogos({
      logos: { favicon: "/a", webLogo: "/w" },
    })!;
    const b = parseLiveLogos({
      logos: { favicon: "/a", webLogo: "/w" },
    })!;
    const c = parseLiveLogos({
      logos: { favicon: "/a", webLogo: "/other" },
    })!;
    expect(logosEqual(a, b)).toBe(true);
    expect(logosEqual(a, c)).toBe(false);
  });
});

describe("applyDocumentLogos", () => {
  it("upserts favicon, apple-touch-icon, and splash links", () => {
    document.head.innerHTML = "";
    applyDocumentLogos({
      favicon: "/pwa-icons/2/favicon.ico",
      faviconDark: null,
      appleTouchIcon: "/pwa-icons/2/apple-touch-icon.png",
      webLogo: "https://cdn/w.svg?v=2",
      iosSplash: "https://cdn/s.png?v=2",
      manifest: "/manifest.json?v=2",
      iconToken: "2",
    });
    const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const apple = document.querySelector<HTMLLinkElement>(
      "link[rel='apple-touch-icon']",
    );
    const splash = document.querySelector<HTMLLinkElement>(
      "link[rel='apple-touch-startup-image']",
    );
    const manifest = document.querySelector<HTMLLinkElement>(
      "link[rel='manifest']",
    );
    expect(icon?.getAttribute("href")).toBe("/pwa-icons/2/favicon.ico");
    expect(apple?.getAttribute("href")).toBe(
      "/pwa-icons/2/apple-touch-icon.png",
    );
    expect(splash?.getAttribute("href")).toBe("https://cdn/s.png?v=2");
    expect(manifest?.getAttribute("href")).toBe("/manifest.json?v=2");
  });
});
