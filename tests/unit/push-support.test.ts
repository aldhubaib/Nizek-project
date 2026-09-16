// Pure classification behind the enable handshake (src/lib/push/support.ts).

import { describe, expect, it } from "vitest";
import {
  applicationServerKeyMatches,
  classifyPermission,
  classifySupport,
  classifySyncResponse,
  decodeVapidKey,
  detectPushPlatform,
  isInstallRequired,
  isIosNonSafari,
  vapidKeyHash,
} from "@/lib/push/support";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

const capable = {
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  vapidConfigured: true,
};

describe("detectPushPlatform", () => {
  it("identifies iPhone, Android, and desktop", () => {
    expect(detectPushPlatform(IPHONE_SAFARI)).toBe("ios");
    expect(detectPushPlatform(ANDROID_CHROME)).toBe("android");
    expect(detectPushPlatform(DESKTOP_CHROME)).toBe("desktop");
  });

  it("treats a touch-capable MacIntel as iPadOS", () => {
    expect(detectPushPlatform(DESKTOP_CHROME, "MacIntel", 5)).toBe("ios");
  });
});

describe("isIosNonSafari", () => {
  it("flags Chrome/Firefox on iOS and nothing else", () => {
    expect(isIosNonSafari(IPHONE_CHROME)).toBe(true);
    expect(isIosNonSafari(IPHONE_CHROME.replace("CriOS", "FxiOS"))).toBe(true);
    expect(isIosNonSafari(IPHONE_SAFARI)).toBe(false);
    expect(isIosNonSafari(ANDROID_CHROME)).toBe(false);
    expect(isIosNonSafari(DESKTOP_CHROME)).toBe(false);
  });
});

describe("classifySupport", () => {
  it("passes a fully capable browser", () => {
    expect(classifySupport({ ...capable, platform: "desktop", standalone: false })).toEqual({ ok: true });
  });

  it("tells iOS Chrome users to open in Safari", () => {
    expect(
      classifySupport({
        ...capable,
        hasPushManager: false,
        platform: "ios",
        standalone: false,
        userAgent: IPHONE_CHROME,
      }),
    ).toEqual({ ok: false, reason: "needs-safari-install" });
  });

  it("tells an iOS Safari browser tab to install rather than giving up", () => {
    expect(
      classifySupport({
        ...capable,
        hasPushManager: false,
        platform: "ios",
        standalone: false,
        userAgent: IPHONE_SAFARI,
      }),
    ).toEqual({ ok: false, reason: "needs-install" });
  });

  it("does not offer install steps to an installed iOS app", () => {
    expect(
      classifySupport({ ...capable, platform: "ios", standalone: true, userAgent: IPHONE_SAFARI }),
    ).toEqual({ ok: true });
  });

  it("reports unsupported on a desktop browser without push", () => {
    expect(
      classifySupport({ ...capable, hasPushManager: false, platform: "desktop", standalone: false }),
    ).toEqual({ ok: false, reason: "unsupported" });
  });

  it("fails fast when the server has no VAPID keys", () => {
    const r = classifySupport({ ...capable, vapidConfigured: false, platform: "desktop", standalone: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported");
  });
});

describe("classifyPermission", () => {
  it("separates granted, blocked and dismissed", () => {
    expect(classifyPermission("granted")).toEqual({ ok: true });
    expect(classifyPermission("denied")).toEqual({ ok: false, reason: "permission-denied" });
    expect(classifyPermission("default")).toEqual({ ok: false, reason: "permission-dismissed" });
  });
});

describe("classifySyncResponse", () => {
  it("succeeds only when the server confirms the stored row", () => {
    expect(classifySyncResponse(true, 200, { ok: true, subscriptionId: "sub_1" })).toEqual({ ok: true });
  });

  it("rejects a 200 that does not confirm the row was saved", () => {
    const r = classifySyncResponse(true, 200, { ok: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("server-rejected");
  });

  it("explains an expired session rather than blaming the browser", () => {
    const r = classifySyncResponse(false, 401, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/session expired/i);
  });

  it("detects the impersonation short-circuit despite its 200", () => {
    expect(classifySyncResponse(true, 200, { ok: true, skipped: "impersonating" })).toEqual({
      ok: false,
      reason: "impersonating",
    });
  });
});

describe("VAPID key helpers", () => {
  const bytes = new Uint8Array(65);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
  const key = Buffer.from(bytes).toString("base64url");

  it("round-trips a base64url key", () => {
    expect(Array.from(decodeVapidKey(key))).toEqual(Array.from(bytes));
  });

  it("matches identical bytes and rejects different or missing keys", () => {
    expect(applicationServerKeyMatches(bytes.slice().buffer as ArrayBuffer, bytes)).toBe(true);
    const other = bytes.slice();
    other[3] ^= 1;
    expect(applicationServerKeyMatches(other.buffer as ArrayBuffer, bytes)).toBe(false);
    expect(applicationServerKeyMatches(bytes.slice(0, 10).buffer as ArrayBuffer, bytes)).toBe(false);
    expect(applicationServerKeyMatches(null, bytes)).toBe(false);
  });

  it("hashes keys deterministically and distinguishes rotations", () => {
    expect(vapidKeyHash(key)).toBe(vapidKeyHash(key));
    expect(vapidKeyHash(key)).toHaveLength(8);
    expect(vapidKeyHash(key)).not.toBe(vapidKeyHash(key.slice(1) + "A"));
  });
});

describe("isInstallRequired", () => {
  it("is true only for the two install reasons", () => {
    expect(isInstallRequired("needs-install")).toBe(true);
    expect(isInstallRequired("needs-safari-install")).toBe(true);
    expect(isInstallRequired("permission-denied")).toBe(false);
    expect(isInstallRequired(null)).toBe(false);
  });
});
