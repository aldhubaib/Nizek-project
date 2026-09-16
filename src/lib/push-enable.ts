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
 * Detects whether the current iOS browser is Safari. On iOS all browsers use
 * WebKit, but only Safari (and standalone PWAs opened from Safari) can install
 * a proper PWA with service worker + push support. Chrome, Firefox, Edge etc.
 * on iOS report "CriOS", "FxiOS", "EdgiOS" in the UA string.
 *
 * Nothing here may touch window/navigator — the UA string is passed in.
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

  // iOS + non-Safari browser (Chrome, Firefox, Edge…): these cannot create a
  // working PWA even if "Add to Home Screen" is used. The user must open the
  // site in Safari first, then install from there.
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

// ─── Gate / self-heal decisions ─────────────────────────────────────────────
// Kept pure so the "spinner forever" and "heal loop" regressions have tests.

/** Minimum gap between automatic (non-gesture) subscription repair attempts. */
export const HEAL_COOLDOWN_MS = 60_000;

export type PushEnableFailure = { reason: PushEnableReason; detail?: string };

/**
 * Whether the hook should try `syncPushSubscription()` on its own right now.
 * Only when the OS already granted permission (otherwise a gesture is needed),
 * the device is not fully enabled, and we have not tried recently. The cooldown
 * is what prevents "heal fails -> refresh -> heal fails" from looping forever.
 */
export function shouldAttemptHeal(input: {
  permission: NotificationPermission | "unsupported";
  /** null = status check timed out or has not run. */
  enabled: boolean | null;
  supported: boolean;
  lastHealAt: number;
  now: number;
}): boolean {
  if (input.permission !== "granted") return false;
  if (!input.supported) return false;
  if (input.enabled === true) return false;
  return input.now - input.lastHealAt >= HEAL_COOLDOWN_MS;
}

/** Support failures the user CAN fix by installing the app the right way. */
export function isInstallRequired(reason: PushEnableReason | null | undefined): boolean {
  return reason === "needs-install" || reason === "needs-safari-install";
}

/**
 * Whether the full-screen gate must block the app.
 *
 * - iOS browser tab (push unsupported until installed from Safari): gate with
 *   the install instructions — notifications are mandatory, so a tab is not a
 *   way around them. Truly unsupported browsers (no install path) are never
 *   gated; there is nothing the user could do.
 * - Permission `default`/`denied`: gate immediately. This is synchronous
 *   browser state, so we never wait on a network check (and never hide the
 *   gate behind a `checking` flag that can stay true forever).
 * - Permission `granted`: only gate once the status check says the device is
 *   NOT enabled AND an automatic repair already failed. While the repair is in
 *   flight the user keeps working.
 */
export function shouldGate(input: {
  permission: NotificationPermission | "unsupported";
  enabled: boolean | null;
  healFailure: PushEnableFailure | null;
  supported: boolean;
  /** Why push is unsupported here, when it is (from classifySupport). */
  supportReason?: PushEnableReason | null;
  production: boolean;
}): boolean {
  if (!input.production) return false;
  if (isInstallRequired(input.supportReason)) return true;
  if (!input.supported) return false;
  if (input.permission === "unsupported") return false;
  if (input.permission !== "granted") return true;
  // An admin viewing as another user is refused registration by design;
  // locking them out would be a bug, not enforcement.
  if (input.healFailure?.reason === "impersonating") return false;
  return input.enabled === false && input.healFailure !== null;
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
    case "needs-safari-install":
      return {
        title: "Open in Safari to install",
        steps: [
          "Notifications only work from the Safari version of the app.",
          "Open this site in Safari (not Chrome or other browsers).",
          "Tap the Share button, then choose \"Add to Home Screen\".",
          "Open the app from your home screen to enable notifications.",
        ],
        retryLabel: null,
        showDiagnostics: false,
      };

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
                "Turn on \"Allow Notifications\" (if it's already on, turn it off and on again).",
                "Fully close Nizek: swipe up to the app switcher and swipe it away. iOS only applies the change after a restart.",
                "Reopen Nizek from your home screen and tap the button below.",
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
