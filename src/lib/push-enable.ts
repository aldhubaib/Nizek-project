// Pure decision logic for the "turn on notifications" handshake, separated
// from browser I/O (push-client.ts) so every failure mode is unit testable.
// Nothing here may touch window/navigator — inputs are passed in.

import { isIosUserAgent } from "@/lib/home-screen-icon-update";

/**
 * Why enabling push did not finish. Each value maps to distinct user-facing
 * guidance — collapsing them is what made the old flow unfixable for users.
 */
export type PushEnableReason =
  /** No PushManager and no install path that would grant one. */
  | "unsupported"
  /** iOS in a browser tab: push only exists for home-screen installs. */
  | "needs-install"
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

export function pushFailure(
  reason: PushEnableReason,
  detail?: string,
): PushEnableResult {
  return detail ? { ok: false, reason, detail } : { ok: false, reason };
}

export type PushPlatform = "ios" | "android" | "desktop";

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
export function classifyPermission(
  permission: NotificationPermission,
): PushEnableResult {
  if (permission === "granted") return { ok: true };
  return pushFailure(
    permission === "denied" ? "permission-denied" : "permission-dismissed",
  );
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
}): PushEnableResult {
  if (!input.vapidConfigured) {
    return pushFailure("unsupported", "Push keys are not configured on the server.");
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
 * Interprets POST /api/push. The old code ignored this response entirely, so a
 * 401 from an expired session still reported success and the toggle sat on
 * while the database held no subscription.
 */
export function classifySyncResponse(
  ok: boolean,
  status: number,
  body: unknown,
): PushEnableResult {
  const parsed = (body ?? null) as {
    skipped?: string;
    subscriptionId?: string;
  } | null;

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
    return pushFailure(
      "server-rejected",
      "The server did not confirm the subscription was saved.",
    );
  }

  return { ok: true };
}

/**
 * Whether an existing subscription was created with the VAPID key we still
 * sign with. A mismatch (key rotation) makes every send fail 403 forever, and
 * 403 is not a "gone" status so the stale row is never pruned server-side.
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

export interface PushFailureGuidance {
  title: string;
  steps: string[];
  /** Label for the recovery button, or null when retrying cannot help. */
  retryLabel: string | null;
  /** Whether to point the user at the diagnostics panel. */
  showDiagnostics: boolean;
}

/** Actionable, platform-specific recovery steps for a failed enable attempt. */
export function describePushFailure(
  reason: PushEnableReason,
  platform: PushPlatform,
): PushFailureGuidance {
  switch (reason) {
    case "needs-install":
      return {
        title: "Install the app first",
        steps: [
          "Tap the Share button in Safari's toolbar.",
          "Choose \"Add to Home Screen\".",
          "Open the app from your home screen, then turn this on again.",
        ],
        retryLabel: null,
        showDiagnostics: false,
      };

    case "permission-denied":
      return {
        title: "Notifications are blocked",
        steps:
          platform === "ios"
            ? [
                "Open the iPhone Settings app.",
                "Tap Notifications, then find Nizek in the list.",
                "Turn on \"Allow Notifications\", then come back and check again.",
              ]
            : platform === "android"
              ? [
                  "Press and hold the app icon, then tap App info.",
                  "Tap Notifications and turn them on.",
                  "Come back and check again.",
                ]
              : [
                  "Click the lock or settings icon to the left of the address bar.",
                  "Set Notifications to Allow.",
                  "Reload the page, then check again.",
                ],
        retryLabel: "I've allowed it — check again",
        showDiagnostics: false,
      };

    case "permission-dismissed":
      return {
        title: "Permission wasn't granted",
        steps: [
          "Your browser closed the prompt without a choice.",
          "Try again and choose Allow when the prompt appears.",
        ],
        retryLabel: "Try again",
        showDiagnostics: false,
      };

    case "no-service-worker":
      return {
        title: "The app isn't ready yet",
        steps: [
          "The background service that receives notifications didn't start.",
          "Reload the app, then try again.",
        ],
        retryLabel: "Try again",
        showDiagnostics: true,
      };

    case "subscribe-failed":
      return {
        title: "This device couldn't subscribe",
        steps: [
          "Your browser refused to create a notification subscription.",
          "Try again. If it keeps failing, reload the app or contact an admin.",
        ],
        retryLabel: "Try again",
        showDiagnostics: true,
      };

    case "server-rejected":
      return {
        title: "Couldn't finish setup",
        steps: [
          "This device was allowed to send notifications, but we couldn't save it to your account.",
          "Check your connection and try again.",
        ],
        retryLabel: "Try again",
        showDiagnostics: true,
      };

    case "impersonating":
      return {
        title: "Not available while viewing as another user",
        steps: [
          "You're currently viewing the app as someone else.",
          "Stop impersonating first, then turn notifications on for your own account.",
        ],
        retryLabel: null,
        showDiagnostics: false,
      };

    case "unsupported":
    default:
      return {
        title: "Not supported on this device",
        steps: [
          "This browser can't receive push notifications.",
          "Try Chrome or Edge on desktop, or install the app on your phone.",
        ],
        retryLabel: null,
        showDiagnostics: true,
      };
  }
}
