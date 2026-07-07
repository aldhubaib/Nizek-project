// Browser-side helpers for Web Push subscriptions. Shared by the service
// worker registration banner and the notifications toggle.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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

/** True when this device currently has an active, granted push subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Create (or reuse) this device's push subscription and sync it to the server.
 * Assumes notification permission is already granted.
 */
export async function syncPushSubscription(
  registration?: ServiceWorkerRegistration,
): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = registration ?? (await navigator.serviceWorker.ready);
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
    }

    const sub = subscription.toJSON();
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Request permission (must be called from a user gesture on iOS/Android) and
 * subscribe. Returns whether push ended up enabled.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  return syncPushSubscription();
}

/** Unsubscribe this device and remove it from the server. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    await subscription?.unsubscribe();
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
  } catch {}
}
