// Pure classification for the push handshake: can this device subscribe, what
// did the permission prompt return, did the server accept the subscription.
// Nothing here may touch window/navigator — inputs are passed in, so every
// failure mode is unit testable.

import { isIosUserAgent } from "@/lib/home-screen-icon-update";
import type { PushPlatform } from "@/lib/push/device-report";

export type { PushPlatform };

/**
 * Why enabling push did not finish. Each value maps to distinct user-facing
 * guidance — collapsing them is what made the old flow unfixable for users.
 */
export type PushEnableReason =
  /** No PushManager and no install path that would grant one. */
  | "unsupported"
  /** iOS in a browser tab: push only exists for home-screen installs. */
  | "needs-install"
  /** iOS but using Chrome/Firefox/etc.: must use Safari to install the PWA. */
  | "needs-safari-install"
  /** Permission is blocked; only OS/browser settings can undo it. */
  | "permission-denied"
  /** The user closed the prompt without choosing; retrying is fine. */
  | "permission-dismissed"
  /** No active service worker to subscribe against (registration failed). */
  | "no-service-worker"
  /** pushManager.subscribe() threw — bad VAPID key or push service refusal. */
  | "subscribe-failed"
  /** The subscription never reached the database. */
  | "server-rejected"
  /** An admin is viewing as this user; registering their browser is refused. */
  | "impersonating";

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: PushEnableReason; detail?: string };

export type PushEnableFailure = { reason: PushEnableReason; detail?: string };

export function pushFailure(reason: PushEnableReason, detail?: string): PushEnableResult {
  return detail ? { ok: false, reason, detail } : { ok: false, reason };
}

export function detectPushPlatform(
  ua: string,
  platform?: string,
  maxTouchPoints?: number,
): PushPlatform {
  if (isIosUserAgent(ua, platform, maxTouchPoints)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Maps the outcome of Notification.requestPermission() to a reason. A blocked
 * site resolves "denied" instantly with no prompt shown, which is why it needs
 * different copy from a prompt the user simply dismissed ("default").
 */
export function classifyPermission(permission: NotificationPermission): PushEnableResult {
  if (permission === "granted") return { ok: true };
  return pushFailure(permission === "denied" ? "permission-denied" : "permission-dismissed");
}

/**
 * On iOS every browser is WebKit, but only Safari (and PWAs installed from
 * Safari) get a service worker with push. Chrome/Firefox/Edge/… identify as
 * CriOS/FxiOS/EdgiOS in the UA string.
 */
export function isIosNonSafari(ua: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|UCBrowser|SamsungBrowser/i.test(ua);
}

/**
 * Decides whether a device can subscribe at all, before any prompt is shown.
 * `hasPushManager` is false in an iOS browser tab, where installing to the home
 * screen is the fix rather than a dead end.
 */
export function classifySupport(input: {
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  vapidConfigured: boolean;
  platform: PushPlatform;
  standalone: boolean;
  userAgent?: string;
}): PushEnableResult {
  if (!input.vapidConfigured) {
    return pushFailure("unsupported", "Push keys are not configured on the server.");
  }

  if (
    input.platform === "ios" &&
    !input.standalone &&
    input.userAgent &&
    isIosNonSafari(input.userAgent)
  ) {
    return pushFailure("needs-safari-install");
  }

  if (input.hasNotification && input.hasServiceWorker && input.hasPushManager) {
    return { ok: true };
  }
  if (input.platform === "ios" && !input.standalone) {
    return pushFailure("needs-install");
  }
  return pushFailure("unsupported");
}

/**
 * Interprets POST /api/push. Ignoring this response is how a 401 from an
 * expired session once reported success while the database held nothing.
 */
export function classifySyncResponse(ok: boolean, status: number, body: unknown): PushEnableResult {
  const parsed = (body ?? null) as { skipped?: string; subscriptionId?: string } | null;

  if (parsed?.skipped === "impersonating") return pushFailure("impersonating");

  if (!ok) {
    return pushFailure(
      "server-rejected",
      status === 401 || status === 403
        ? "Your session expired. Sign in again, then retry."
        : `The server returned HTTP ${status}.`,
    );
  }

  // The server echoes the stored row's id. Without it we cannot claim the
  // subscription was persisted.
  if (!parsed?.subscriptionId) {
    return pushFailure("server-rejected", "The server did not confirm the subscription was saved.");
  }

  return { ok: true };
}

/**
 * Whether an existing subscription was created with the VAPID key we still
 * sign with. A mismatch (key rotation) makes every send fail 403 forever.
 */
export function applicationServerKeyMatches(
  existing: ArrayBuffer | null | undefined,
  expected: Uint8Array,
): boolean {
  if (!existing) return false;
  const actual = new Uint8Array(existing);
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

/** Decodes a base64url VAPID public key into the bytes subscribe() wants. */
export function decodeVapidKey(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Short, stable fingerprint of the VAPID public key (FNV-1a, hex). Stored on
 * the subscription row so a key rotation is visible server-side too.
 */
export function vapidKeyHash(publicKey: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < publicKey.length; i++) {
    h ^= publicKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Support failures the user CAN fix by installing the app the right way. */
export function isInstallRequired(reason: PushEnableReason | null | undefined): boolean {
  return reason === "needs-install" || reason === "needs-safari-install";
}
