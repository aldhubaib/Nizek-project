// Synchronous browser probes. Safe to call during render after mount; every
// function returns a sensible default when window is undefined.

import type { PushPermissionState, PushPlatform } from "@/lib/push/device-report";
import {
  classifySupport,
  detectPushPlatform,
  pushFailure,
  type PushEnableResult,
} from "@/lib/push/support";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** True when running as an installed PWA rather than a browser tab. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari's non-standard flag for home-screen apps.
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

export function pushPlatform(): PushPlatform {
  if (typeof navigator === "undefined") return "desktop";
  return detectPushPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

export function currentPermission(): PushPermissionState {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

/** All the APIs subscribe() needs exist in this browser. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

/**
 * Whether this device could subscribe at all, and if not, why — so an iOS
 * browser tab gets install instructions instead of a dead button.
 */
export function pushSupportStatus(): PushEnableResult {
  if (typeof window === "undefined") return pushFailure("unsupported");
  return classifySupport({
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    vapidConfigured: Boolean(VAPID_PUBLIC_KEY),
    platform: pushPlatform(),
    standalone: isStandaloneDisplayMode(),
    userAgent: navigator.userAgent,
  });
}

export function appBuild(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_BUILD_TIME;
  return raw ? String(raw) : null;
}

/** Resolves to null (never rejects) when `promise` does not settle in `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
