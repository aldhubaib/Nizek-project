// Browser-side subscription I/O: read/create the PushSubscription, sync it to
// the server, query the server's view. Decision logic lives in support.ts /
// state.ts; this file only does I/O, each call bounded by a timeout.

import { getDeviceId } from "@/lib/device-id";
import {
  VAPID_PUBLIC_KEY,
  appBuild,
  isStandaloneDisplayMode,
  pushPlatform,
  pushSupportStatus,
  withTimeout,
} from "@/lib/push/env";
import { resolveRegistration } from "@/lib/push/registration";
import {
  applicationServerKeyMatches,
  classifySyncResponse,
  decodeVapidKey,
  pushFailure,
  vapidKeyHash,
  type PushEnableResult,
} from "@/lib/push/support";

/** pushManager calls can hang on an iOS zombie worker; never wait forever. */
const PUSH_MANAGER_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 12_000;

export interface ServerPushStatus {
  registered: boolean;
  subscriptionId: string | null;
  failCount: number;
  vapidKeyHash: string | null;
}

export async function readLocalSubscription(
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  try {
    return await withTimeout(reg.pushManager.getSubscription(), PUSH_MANAGER_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/push/status — the one network round-trip of a status check. */
export async function fetchServerStatus(
  endpoint: string | null,
): Promise<ServerPushStatus | null> {
  const params = new URLSearchParams();
  if (endpoint) params.set("endpoint", endpoint);
  const deviceId = getDeviceId();
  if (deviceId) params.set("deviceId", deviceId);
  const res = await fetchWithTimeout(`/api/push/status?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as Partial<ServerPushStatus> | null;
  if (!body) return null;
  return {
    registered: body.registered === true,
    subscriptionId: typeof body.subscriptionId === "string" ? body.subscriptionId : null,
    failCount: typeof body.failCount === "number" ? body.failCount : 0,
    vapidKeyHash: typeof body.vapidKeyHash === "string" ? body.vapidKeyHash : null,
  };
}

/**
 * Make sure this registration holds a subscription under the CURRENT VAPID
 * key. A subscription made under a rotated key fails every send with 403
 * forever, so it is replaced; its old endpoint is returned so the server can
 * drop the dead row in the same request.
 */
export async function ensureSubscription(
  reg: ServiceWorkerRegistration,
): Promise<
  | { ok: true; subscription: PushSubscription; oldEndpoint: string | null }
  | { ok: false; reason: "subscribe-failed"; detail?: string }
> {
  const expectedKey = decodeVapidKey(VAPID_PUBLIC_KEY);
  let subscription = await readLocalSubscription(reg);
  let oldEndpoint: string | null = null;

  if (
    subscription &&
    !applicationServerKeyMatches(subscription.options.applicationServerKey, expectedKey)
  ) {
    oldEndpoint = subscription.endpoint;
    try {
      await withTimeout(subscription.unsubscribe(), PUSH_MANAGER_TIMEOUT_MS);
    } catch {
      // subscribe() below replaces it in practice.
    }
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey as BufferSource,
        }),
        PUSH_MANAGER_TIMEOUT_MS,
      );
    } catch (err) {
      return {
        ok: false,
        reason: "subscribe-failed",
        detail: err instanceof Error ? err.message : undefined,
      };
    }
    if (!subscription) {
      return {
        ok: false,
        reason: "subscribe-failed",
        detail: "Timed out waiting for the browser to create the subscription.",
      };
    }
  }

  return { ok: true, subscription, oldEndpoint };
}

/** POST /api/push. `oldEndpoint` lets the server retire the row it replaces. */
export async function postSubscription(
  subscription: PushSubscription,
  oldEndpoint: string | null,
): Promise<PushEnableResult> {
  const json = subscription.toJSON();
  const res = await fetchWithTimeout("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      deviceId: getDeviceId() || undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      standalone: isStandaloneDisplayMode(),
      platform: pushPlatform(),
      oldEndpoint: oldEndpoint ?? undefined,
      vapidKeyHash: vapidKeyHash(VAPID_PUBLIC_KEY),
      appBuild: appBuild() ?? undefined,
    }),
  });
  if (!res) {
    return pushFailure("server-rejected", "The request could not be sent.");
  }
  const body = await res.json().catch(() => null);
  return classifySyncResponse(res.ok, res.status, body);
}

/**
 * Create (or reuse) this device's subscription and register it. Assumes
 * permission is already granted. Resolves the registration itself when none
 * is passed.
 */
export async function syncSubscription(
  registration?: ServiceWorkerRegistration | null,
): Promise<PushEnableResult & { endpoint?: string }> {
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

  const ensured = await ensureSubscription(reg);
  if (!ensured.ok) return ensured;

  const posted = await postSubscription(ensured.subscription, ensured.oldEndpoint);
  return posted.ok ? { ok: true, endpoint: ensured.subscription.endpoint } : posted;
}

/**
 * Request permission. MUST be the first await in a click handler: iOS only
 * honours requestPermission() while the user gesture is still active, and
 * Android demotes to the quiet mini-infobar otherwise.
 */
export async function requestPermissionFromGesture(): Promise<NotificationPermission> {
  try {
    return await Notification.requestPermission();
  } catch {
    // Legacy callback-only implementations.
    return Notification.permission;
  }
}

/**
 * Ask the service worker to display a banner through its real push-display
 * path, forcing it to show even though the app is focused. Confirms setup
 * worked at the moment the user turns notifications on.
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
