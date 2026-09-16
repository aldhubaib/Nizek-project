// The push state machine, pure. Every component (gate, account card,
// diagnostics) renders from derivePushView(); the store only feeds it facts.
// Nothing here may touch window/navigator.

import type { PushPermissionState, PushPlatform } from "@/lib/push/device-report";
import {
  isInstallRequired,
  type PushEnableFailure,
  type PushEnableReason,
  type PushEnableResult,
} from "@/lib/push/support";

/** What the user should see right now. */
export type PushView =
  /** Permission granted, subscribed, server confirmed. */
  | "enabled"
  /** iOS Safari tab: must Add to Home Screen. */
  | "install"
  /** iOS Chrome/Firefox/… tab: must open in Safari, then install. */
  | "safari-install"
  /** iOS PWA, permission not asked yet: explain the one-shot prompt first. */
  | "pre-prompt"
  /** Permission not asked yet (or dismissed): show Enable. */
  | "prompt"
  /** Permission blocked at OS/browser level. */
  | "denied"
  /** Permission granted; we are (re)subscribing automatically. Never gated. */
  | "repairing"
  /** Permission granted; first check has not finished. Never gated. */
  | "verifying"
  /** Automatic repair failed; show the concrete reason and a retry. */
  | "repair-failed"
  /** No push and no install path. Never gated. */
  | "unsupported"
  /** Admin viewing as another user; registration refused by design. Never gated. */
  | "impersonating";

export interface PushViewInput {
  support: PushEnableResult;
  platform: PushPlatform;
  standalone: boolean;
  permission: PushPermissionState;
  /** null = not verified yet (or the check timed out). */
  enabled: boolean | null;
  repairing: boolean;
  /** Last failure from an automatic repair or the user's own attempt. */
  lastFailure: PushEnableFailure | null;
}

export function derivePushView(input: PushViewInput): PushView {
  if (!input.support.ok) {
    if (input.support.reason === "needs-install") return "install";
    if (input.support.reason === "needs-safari-install") return "safari-install";
    return "unsupported";
  }
  if (input.permission === "unsupported") return "unsupported";
  if (input.lastFailure?.reason === "impersonating") return "impersonating";
  if (input.permission === "denied") return "denied";
  if (input.permission === "default") {
    return input.platform === "ios" && input.standalone ? "pre-prompt" : "prompt";
  }
  // granted
  if (input.enabled === true) return "enabled";
  if (input.repairing) return "repairing";
  if (input.enabled === null) return "verifying";
  return input.lastFailure ? "repair-failed" : "verifying";
}

/**
 * Whether the full-screen gate must block the app. Driven by the view, so the
 * gate can never be hidden by a stuck "checking" flag, and never shown while
 * the runtime is still doing its job (verifying/repairing).
 */
export function shouldGate(view: PushView, opts: { production: boolean }): boolean {
  if (!opts.production) return false;
  switch (view) {
    case "install":
    case "safari-install":
    case "pre-prompt":
    case "prompt":
    case "denied":
    case "repair-failed":
      return true;
    case "enabled":
    case "repairing":
    case "verifying":
    case "unsupported":
    case "impersonating":
      return false;
  }
}

/** Minimum gap between automatic (non-gesture) subscription repair attempts. */
export const HEAL_COOLDOWN_MS = 60_000;

/**
 * Whether the store should try to (re)subscribe on its own right now. Only
 * when the OS already granted permission (otherwise a gesture is needed), the
 * device is not fully enabled, and we have not tried recently. The cooldown is
 * what prevents "heal fails -> refresh -> heal fails" from looping forever.
 */
export function shouldAttemptHeal(input: {
  permission: PushPermissionState;
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

// ─── Guidance ───────────────────────────────────────────────────────────────

export interface PushGuidancePath {
  title: string;
  steps: string[];
}

export interface PushGuidance {
  title: string;
  /** One-line explanation shown under the title. */
  intro?: string;
  /** Ordered steps (single path). */
  steps: string[];
  /** Alternative recovery paths (iOS denied has two). */
  paths?: PushGuidancePath[];
  /** Label for the primary button, or null when a button cannot help. */
  actionLabel: string | null;
  /** Point the user at the diagnostics panel. */
  showDiagnostics: boolean;
}

const IOS_DENIED_PATHS: PushGuidancePath[] = [
  {
    title: "Path 1 — allow it in Settings",
    steps: [
      "Open the iPhone Settings app, tap Notifications, and find Nizek.",
      "Turn on \"Allow Notifications\". If it is already on, turn it off and on again.",
      "Fully close Nizek: swipe up to the app switcher and swipe Nizek away.",
      "Reopen Nizek from your home screen and tap \"Check again\".",
    ],
  },
  {
    title: "Path 2 — reinstall (always works)",
    steps: [
      "Press and hold the Nizek icon on your home screen, then Remove App > Delete.",
      "Open Safari (not Chrome), go to panel.nizek.com, tap Share, then \"Add to Home Screen\".",
      "Open Nizek from the home screen, tap Enable Notifications, then tap Allow.",
    ],
  },
];

/** Actionable, platform-specific recovery steps for a failed enable attempt. */
export function describePushFailure(
  reason: PushEnableReason,
  platform: PushPlatform,
): PushGuidance {
  switch (reason) {
    case "needs-safari-install":
      return {
        title: "Open in Safari to install",
        intro: "Notifications only work from the app installed through Safari.",
        steps: [
          "Open panel.nizek.com in Safari (not Chrome or another browser).",
          "Tap the Share button, then choose \"Add to Home Screen\".",
          "Open Nizek from your home screen and tap Enable Notifications.",
        ],
        actionLabel: null,
        showDiagnostics: false,
      };

    case "needs-install":
      return {
        title: "Install the app first",
        intro: "On iPhone, notifications only work from the installed app.",
        steps: [
          "Tap the Share button in Safari's toolbar.",
          "Choose \"Add to Home Screen\".",
          "Open Nizek from your home screen and tap Enable Notifications.",
        ],
        actionLabel: null,
        showDiagnostics: false,
      };

    case "permission-denied":
      if (platform === "ios") {
        return {
          title: "Notifications are blocked",
          intro: "iPhone remembers a \"Don't Allow\". Either path below fixes it.",
          steps: [],
          paths: IOS_DENIED_PATHS,
          actionLabel: "I've done this — check again",
          showDiagnostics: false,
        };
      }
      return {
        title: "Notifications are blocked",
        steps:
          platform === "android"
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
        actionLabel: "I've allowed it — check again",
        showDiagnostics: false,
      };

    case "permission-dismissed":
      return {
        title: "Permission wasn't granted",
        steps: [
          "The prompt closed without a choice.",
          "Try again and choose Allow when it appears.",
        ],
        actionLabel: "Try again",
        showDiagnostics: false,
      };

    case "no-service-worker":
      return {
        title: "The app isn't ready yet",
        steps: [
          "The background service that receives notifications didn't start.",
          platform === "ios"
            ? "Fully close Nizek (swipe it away in the app switcher), reopen it, then try again."
            : "Reload the app, then try again.",
        ],
        actionLabel: "Try again",
        showDiagnostics: true,
      };

    case "subscribe-failed":
      return {
        title: "This device couldn't subscribe",
        steps: [
          "The browser refused to create a notification subscription.",
          platform === "ios"
            ? "Fully close Nizek and reopen it, then try again. If it keeps failing, delete the icon and reinstall from Safari."
            : "Try again. If it keeps failing, reload the app or contact an admin.",
        ],
        actionLabel: "Try again",
        showDiagnostics: true,
      };

    case "server-rejected":
      return {
        title: "Couldn't finish setup",
        steps: [
          "This device was allowed to send notifications, but we couldn't save it to your account.",
          "Check your connection and try again.",
        ],
        actionLabel: "Try again",
        showDiagnostics: true,
      };

    case "impersonating":
      return {
        title: "Not available while viewing as another user",
        steps: [
          "You're currently viewing the app as someone else.",
          "Stop impersonating first, then turn notifications on for your own account.",
        ],
        actionLabel: null,
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
        actionLabel: null,
        showDiagnostics: true,
      };
  }
}

/**
 * What to show for a view. `failure` supplies the concrete reason for
 * repair-failed (and detail text for anything else).
 */
export function describeView(
  view: PushView,
  platform: PushPlatform,
  failure: PushEnableFailure | null,
): PushGuidance | null {
  switch (view) {
    case "enabled":
    case "verifying":
    case "repairing":
      return null;
    case "install":
      return describePushFailure("needs-install", platform);
    case "safari-install":
      return describePushFailure("needs-safari-install", platform);
    case "unsupported":
      return describePushFailure("unsupported", platform);
    case "impersonating":
      return describePushFailure("impersonating", platform);
    case "denied":
      return describePushFailure("permission-denied", platform);
    case "pre-prompt":
      return {
        title: "iPhone will ask once",
        intro: "After you tap Continue, iPhone shows a permission prompt.",
        steps: [
          "Tap Allow on the prompt.",
          "If you tap \"Don't Allow\", iPhone remembers it: you would have to delete the app and reinstall it from Safari to be asked again.",
        ],
        actionLabel: "Continue",
        showDiagnostics: false,
      };
    case "prompt":
      return failure && failure.reason === "permission-dismissed"
        ? describePushFailure("permission-dismissed", platform)
        : null;
    case "repair-failed":
      return describePushFailure(failure?.reason ?? "subscribe-failed", platform);
  }
}

/** Whether a view's support reason is an install requirement (for the gate). */
export function viewNeedsInstall(view: PushView): boolean {
  return view === "install" || view === "safari-install";
}

export { isInstallRequired };
