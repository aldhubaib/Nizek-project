// The enable handshake's decision logic. Every case here was a real support
// complaint: a toggle that reported success while the server held no
// subscription, and one error message ("blocked in your browser settings")
// shown for causes that had nothing to do with browser settings.

import { describe, expect, it } from "vitest";
import {
  applicationServerKeyMatches,
  classifyPermission,
  classifySupport,
  classifySyncResponse,
  decodeVapidKey,
  describePushFailure,
  detectPushPlatform,
} from "@/lib/push-enable";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FULL_SUPPORT = {
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  vapidConfigured: true,
  platform: "android" as const,
  standalone: false,
};

describe("detectPushPlatform", () => {
  it("identifies iPhone, Android, and desktop", () => {
    expect(detectPushPlatform(IOS_UA)).toBe("ios");
    expect(detectPushPlatform(ANDROID_UA)).toBe("android");
    expect(detectPushPlatform(MAC_UA)).toBe("desktop");
  });

  it("treats a touch-capable MacIntel as iPadOS", () => {
    expect(detectPushPlatform(MAC_UA, "MacIntel", 5)).toBe("ios");
    expect(detectPushPlatform(MAC_UA, "MacIntel", 0)).toBe("desktop");
  });
});

describe("classifySupport", () => {
  it("passes a fully capable browser", () => {
    expect(classifySupport(FULL_SUPPORT)).toEqual({ ok: true });
  });

  it("tells an iOS browser tab to install rather than giving up", () => {
    const result = classifySupport({
      ...FULL_SUPPORT,
      hasPushManager: false,
      platform: "ios",
      standalone: false,
    });
    expect(result).toEqual({ ok: false, reason: "needs-install" });
  });

  it("does not offer install steps to an installed iOS app", () => {
    // Already on the home screen and still no PushManager — installing again
    // cannot help, so this must not loop the user through Add to Home Screen.
    const result = classifySupport({
      ...FULL_SUPPORT,
      hasPushManager: false,
      platform: "ios",
      standalone: true,
    });
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("reports unsupported on a desktop browser without push", () => {
    expect(
      classifySupport({ ...FULL_SUPPORT, hasPushManager: false, platform: "desktop" }),
    ).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("fails fast when the server has no VAPID keys", () => {
    const result = classifySupport({ ...FULL_SUPPORT, vapidConfigured: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported");
      expect(result.detail).toMatch(/not configured on the server/i);
    }
  });
});

describe("classifyPermission", () => {
  it("accepts granted", () => {
    expect(classifyPermission("granted")).toEqual({ ok: true });
  });

  // "denied" needs settings instructions; "default" just needs another tap.
  // Conflating them is what sent users hunting through settings that already
  // said Allow.
  it("separates a blocked site from a dismissed prompt", () => {
    expect(classifyPermission("denied")).toEqual({
      ok: false,
      reason: "permission-denied",
    });
    expect(classifyPermission("default")).toEqual({
      ok: false,
      reason: "permission-dismissed",
    });
  });
});

describe("classifySyncResponse", () => {
  it("succeeds only when the server confirms the stored row", () => {
    expect(classifySyncResponse(true, 200, { ok: true, subscriptionId: "sub_1" })).toEqual(
      { ok: true },
    );
  });

  // The original bug: the POST result was ignored entirely, so the toggle read
  // "on" while the database held nothing and no notification ever arrived.
  it("rejects a 200 that does not confirm the row was saved", () => {
    expect(classifySyncResponse(true, 200, { ok: true })).toMatchObject({
      ok: false,
      reason: "server-rejected",
    });
    expect(classifySyncResponse(true, 200, null)).toMatchObject({
      ok: false,
      reason: "server-rejected",
    });
  });

  it("explains an expired session rather than blaming the browser", () => {
    const result = classifySyncResponse(false, 401, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("server-rejected");
      expect(result.detail).toMatch(/session expired/i);
    }
  });

  it("surfaces the status code for other server failures", () => {
    const result = classifySyncResponse(false, 500, null);
    expect(result).toMatchObject({ ok: false, reason: "server-rejected" });
    if (!result.ok) expect(result.detail).toContain("500");
  });

  // The impersonation guard answers HTTP 200, so res.ok alone would call this
  // a success and register the admin's browser as the member's device.
  it("detects the impersonation short-circuit despite its 200", () => {
    expect(
      classifySyncResponse(true, 200, { ok: true, skipped: "impersonating" }),
    ).toEqual({ ok: false, reason: "impersonating" });
  });
});

describe("applicationServerKeyMatches", () => {
  const key = new Uint8Array([1, 2, 3, 4]);

  it("matches identical bytes", () => {
    expect(applicationServerKeyMatches(new Uint8Array([1, 2, 3, 4]).buffer, key)).toBe(
      true,
    );
  });

  it("rejects different bytes and different lengths", () => {
    expect(applicationServerKeyMatches(new Uint8Array([1, 2, 3, 9]).buffer, key)).toBe(
      false,
    );
    expect(applicationServerKeyMatches(new Uint8Array([1, 2, 3]).buffer, key)).toBe(
      false,
    );
  });

  // Subscriptions predating applicationServerKey tracking report null. Treating
  // those as a match would keep a possibly-stale subscription forever.
  it("rejects a missing key", () => {
    expect(applicationServerKeyMatches(null, key)).toBe(false);
    expect(applicationServerKeyMatches(undefined, key)).toBe(false);
  });
});

describe("decodeVapidKey", () => {
  it("round-trips a base64url key", () => {
    const bytes = new Uint8Array(65);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
    const encoded = Buffer.from(bytes).toString("base64url");
    expect(Array.from(decodeVapidKey(encoded))).toEqual(Array.from(bytes));
  });
});

describe("describePushFailure", () => {
  it("gives iOS users Settings steps and Android users App info steps", () => {
    expect(describePushFailure("permission-denied", "ios").steps.join(" ")).toMatch(
      /Settings app/i,
    );
    expect(describePushFailure("permission-denied", "android").steps.join(" ")).toMatch(
      /App info/i,
    );
    expect(describePushFailure("permission-denied", "desktop").steps.join(" ")).toMatch(
      /address bar/i,
    );
  });

  it("offers a recheck for blocked permission, since retrying alone can't fix it", () => {
    expect(describePushFailure("permission-denied", "ios").retryLabel).toMatch(
      /check again/i,
    );
  });

  it("never offers a retry for states a retry cannot change", () => {
    expect(describePushFailure("needs-install", "ios").retryLabel).toBeNull();
    expect(describePushFailure("unsupported", "desktop").retryLabel).toBeNull();
    expect(describePushFailure("impersonating", "desktop").retryLabel).toBeNull();
  });

  it("offers a retry for every recoverable failure", () => {
    for (const reason of [
      "permission-dismissed",
      "no-service-worker",
      "subscribe-failed",
      "server-rejected",
    ] as const) {
      expect(describePushFailure(reason, "android").retryLabel).toBeTruthy();
    }
  });

  it("points at Add to Home Screen for an iOS browser tab", () => {
    const guidance = describePushFailure("needs-install", "ios");
    expect(guidance.steps.join(" ")).toMatch(/Add to Home Screen/i);
  });

  it("always returns non-empty guidance", () => {
    for (const reason of [
      "unsupported",
      "needs-install",
      "permission-denied",
      "permission-dismissed",
      "no-service-worker",
      "subscribe-failed",
      "server-rejected",
      "impersonating",
    ] as const) {
      const guidance = describePushFailure(reason, "ios");
      expect(guidance.title.length).toBeGreaterThan(0);
      expect(guidance.steps.length).toBeGreaterThan(0);
    }
  });
});
