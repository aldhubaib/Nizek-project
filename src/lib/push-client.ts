// Browser-side Web Push subscription I/O. Shared by the enable banner, the
// notifications toggle, and the diagnostics panel. All decision logic lives in
// push-enable.ts so it can be unit tested without a browser.

import { getDeviceId } from "@/lib/device-id";
import {
  applicationServerKeyMatches,
  classifyPermission,
  classifySupport,
  classifySyncResponse,
  decodeVapidKey,
  detectPushPlatform,
  pushFailure,
  type PushEnableResult,
  type PushPlatform,
} from "@/lib/push-enable";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * navigator.serviceWorker.ready never rejects, and never settles at all when no
 * service worker is registered. Awaiting it unguarded is what left the toggle
 * spinning and permanently disabled.
 */
const SW_READY_TIMEOUT_MS = 8_000;

/** True when running as an installed PWA rather than a browser tab. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's non-standard flag for home-screen apps.
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function pushPlatform(): PushPlatform {
  if (typeof navigator === "undefined") return "desktop";
  return detectPushPlatform(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
}

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
 * browser tab gets install instructions instead of a disabled switch.
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
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

/**
 * Resolve an active service worker registration, registering /sw.js if nothing
 * has yet. Returns null rather than hanging when registration can't complete.
 *
 * On iOS PWA cold starts the OS may kill the previous SW, leaving a stale
 * registration with no active worker. If the first attempt times out we
 * unregister the stale entry, re-register, and wait once more.
 */
export async function resolveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  // Push belongs to production. PushNotifier deliberately unregisters service
  // workers in dev, because a controlling SW keeps serving stale Turbopack
  // chunks after a rebuild ("module factory is not available").
  if (process.env.NODE_ENV !== "production") return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    if (!existing) {
      await navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
    const reg = await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT_MS);
    if (reg) return reg;

    // First attempt timed out — the registration may be stuck (iOS cold start,
    // interrupted update). Unregister the stale entry and start fresh.
    const stale = await navigator.serviceWorker.getRegistration();
    if (stale && !stale.active) {
      await stale.unregister().catch(() => {});
    }
    await navigator.serviceWorker.register("/sw.js").catch(() => null);
    return await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** Ask the server whether this endpoint is registered for the current user. */
async function isEndpointRegistered(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/push?endpoint=${encodeURIComponent(endpoint)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { registered?: boolean };
    return body.registered === true;
  } catch {
    return false;
  }
}

export interface PushStatus {
  /** Whether this device can subscribe, and why not when it can't. */
  support: PushEnableResult;
  permission: NotificationPermission | "unsupported";
  /** A subscription exists in this browser. */
  hasLocalSubscription: boolean;
  /** The server holds a row for that subscription. */
  registeredOnServer: boolean;
  /** All three aligned — the only state the toggle should read as on. */
  enabled: boolean;
}

/**
 * The truth about this device, checked against the server rather than inferred
 * from the browser alone. A local subscription the server doesn't know about
 * (session expired mid-setup, or the row was pruned) is silently re-synced.
 */
export async function getPushStatus(opts?: { heal?: boolean }): Promise<PushStatus> {
  const support = pushSupportStatus();
  const permission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : ("unsupported" as const);

  const base: PushStatus = {
    support,
    permission,
    hasLocalSubscription: false,
    registeredOnServer: false,
    enabled: false,
  };

  if (!support.ok || permission !== "granted") return base;

  const registration = await resolveRegistration();
  if (!registration) return base;

  let subscription: PushSubscription | null = null;
  try {
    subscription = await registration.pushManager.getSubscription();
  } catch {
    return base;
  }
  if (!subscription) return base;

  let registered = await isEndpointRegistered(subscription.endpoint);

  // Self-heal: the browser is subscribed but the server isn't. Re-post once so
  // the user isn't left with a toggle that reads on and delivers nothing.
  if (!registered && opts?.heal !== false) {
    const result = await syncPushSubscription(registration);
    registered = result.ok;
  }

  return {
    support,
    permission,
    hasLocalSubscription: true,
    registeredOnServer: registered,
    enabled: registered,
  };
}

/**
 * True when this device currently has an active, granted, server-registered
 * push subscription.
 */
export async function isPushEnabled(): Promise<boolean> {
  return (await getPushStatus()).enabled;
}

/**
 * Create (or reuse) this device's push subscription and sync it to the server.
 * Assumes notification permission is already granted.
 */
export async function syncPushSubscription(
  registration?: ServiceWorkerRegistration,
): Promise<PushEnableResult> {
  const support = pushSupportStatus();
  if (!support.ok) return support;

  const reg = registration ?? (await resolveRegistration());
  if (!reg) {
    return pushFailure(
      "no-service-worker",
      process.env.NODE_ENV === "production"
        ? undefined
        : "Service workers are disabled outside production builds.",
    );
  }

  const expectedKey = decodeVapidKey(VAPID_PUBLIC_KEY!);

  let subscription: PushSubscription | null;
  try {
    subscription = await reg.pushManager.getSubscription();
  } catch {
    subscription = null;
  }

  // A subscription created under a rotated VAPID key fails every send with 403
  // forever, and 403 isn't a "gone" status so the row is never pruned. Replace
  // it rather than reusing it.
  if (
    subscription &&
    !applicationServerKeyMatches(
      subscription.options.applicationServerKey,
      expectedKey,
    )
  ) {
    try {
      await subscription.unsubscribe();
    } catch {
      // Keep going: subscribe() below replaces it in practice.
    }
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey as BufferSource,
      });
    } catch (err) {
      return pushFailure(
        "subscribe-failed",
        err instanceof Error ? err.message : undefined,
      );
    }
  }

  const sub = subscription.toJSON();
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.keys,
        deviceId: getDeviceId(),
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        standalone: isStandaloneDisplayMode(),
      }),
    });
    const body = await res.json().catch(() => null);
    return classifySyncResponse(res.ok, res.status, body);
  } catch (err) {
    return pushFailure(
      "server-rejected",
      err instanceof Error ? err.message : "The request could not be sent.",
    );
  }
}

/**
 * Request permission (must be called from a user gesture on iOS/Android) and
 * subscribe. The result carries why it failed so the UI can give real steps.
 */
export async function enablePush(): Promise<PushEnableResult> {
  const support = pushSupportStatus();
  if (!support.ok) return support;

  // Request permission before anything else that awaits: iOS only honours
  // requestPermission() while the user gesture is still active, so resolving
  // the service worker first would get the prompt silently denied.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    // Legacy callback-only implementations.
    permission = Notification.permission;
  }

  const permissionResult = classifyPermission(permission);
  if (!permissionResult.ok) return permissionResult;

  // syncPushSubscription resolves (and registers) the service worker itself, so
  // this no longer depends on PushNotifier having run first.
  return syncPushSubscription();
}

/**
 * Ask the service worker to display a banner through its real push-display
 * path, forcing it to show even though the app is focused. Used to confirm
 * setup worked at the moment the user turns notifications on.
 */
export async function showLocalTestBanner(): Promise<boolean> {
  try {
    const registration = await resolveRegistration();
    const worker = registration?.active;
    if (!worker) return false;
    worker.postMessage({
      type: "simulate-push",
      forceShow: true,
      data: {
        title: "Notifications are on",
        body: "This is what a new message will look like.",
        url: "/dashboard",
        tag: "push-setup-confirmation",
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Unsubscribe this device and remove it from the server. */
export async function disablePush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await resolveRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    await subscription?.unsubscribe();
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
  } catch {}
}
