// Service worker registration for push. Register /sw.js once per page, wait
// for it to be active with a timeout, and NEVER unregister a registration
// that holds a push subscription — that is the one action that silently
// turns a working phone into a silent one.

import { IS_PRODUCTION, withTimeout } from "@/lib/push/env";

/**
 * navigator.serviceWorker.ready never rejects, and never settles at all when
 * no service worker is registered. Awaiting it unguarded is what left the
 * toggle spinning forever.
 */
export const SW_READY_TIMEOUT_MS = 8_000;

let registerOnce: Promise<ServiceWorkerRegistration | null> | null = null;

function swAvailable(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers /sw.js (idempotent in the browser; memoised here so concurrent
 * callers share one promise). Returns the registration or null.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!swAvailable()) return Promise.resolve(null);
  if (!IS_PRODUCTION) return Promise.resolve(null);
  if (!registerOnce) {
    registerOnce = navigator.serviceWorker
      .register("/sw.js")
      .catch(() => null)
      .then((reg) => reg ?? null);
  }
  return registerOnce;
}

/**
 * In development a controlling SW keeps serving stale Turbopack chunks after a
 * rebuild ("module factory is not available"), so push belongs to production
 * and dev unregisters whatever is there.
 */
export async function unregisterAllForDev(): Promise<void> {
  if (!swAvailable() || IS_PRODUCTION) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    // ignore
  }
}

async function hasSubscription(reg: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const sub = await withTimeout(reg.pushManager.getSubscription(), 5_000);
    return sub != null;
  } catch {
    return false;
  }
}

/**
 * Resolve an ACTIVE service worker registration, registering if needed.
 * Returns null instead of hanging when it cannot become active.
 *
 * iOS PWA cold starts can leave a registration whose worker never activates.
 * The old code unregistered it on timeout; if that registration held the
 * subscription the device went silent. Now: an inactive registration is only
 * replaced when it holds NO subscription. Otherwise we hand it back as-is —
 * pushManager works on a registration even while its worker is installing.
 */
export async function resolveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!swAvailable() || !IS_PRODUCTION) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;

    const registered = existing ?? (await registerServiceWorker());
    if (!registered) return null;

    const ready = await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT_MS);
    if (ready) return ready;

    // Not active in time. Keep it if it owns a subscription (the device still
    // receives pushes through it); otherwise a clean re-register is safe.
    if (await hasSubscription(registered)) return registered;

    await registered.unregister().catch(() => false);
    registerOnce = null;
    const fresh = await registerServiceWorker();
    if (!fresh) return null;
    return (await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT_MS)) ?? fresh;
  } catch {
    return null;
  }
}

/** Test hook. */
export function _resetRegistrationForTests(): void {
  registerOnce = null;
}
