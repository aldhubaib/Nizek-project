// Service worker: Web Push + notification-sound caching. Intentionally does NOT
// cache app fetches or drive app updates — the in-app UpdateNotifier owns that.
// Decision logic lives in sw-lib.js so it can be unit tested.

/* global NizekSwLib */
importScripts("/sw-lib.js");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache-first ONLY for the custom notification sound so it plays instantly and
// works offline. Every other request passes through untouched (the in-app
// UpdateNotifier owns app versioning, so app responses always hit the network).
const SOUND_CACHE = "notif-sound-v1";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Uploaded sounds live under a "notification_sound/" R2 prefix. Range requests
  // (partial media) are skipped so we never cache a 206 partial response.
  if (!url.pathname.includes("/notification_sound/")) return;
  if (req.headers.has("range")) return;

  event.respondWith(
    caches.open(SOUND_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        // Keep only the current sound to bound cache size (URLs change per upload).
        const keys = await cache.keys();
        await Promise.all(
          keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k)),
        );
        cache.put(req, res.clone());
        return res;
      } catch {
        const fallback = await cache.match(req, { ignoreSearch: true });
        return fallback || Response.error();
      }
    }),
  );
});

/**
 * Shared push-display path for real pushes and simulated ones (diagnostics /
 * E2E). WhatsApp behavior: show the OS banner (with the OS sound) unless the
 * app is focused AND visible on this device — the in-app chime covers that case.
 */
async function handlePushData(data, opts) {
  const force = opts && opts.forceShow === true;

  let show = true;
  if (!force) {
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const infos = windowClients.map((c) => ({
      focused: c.focused,
      visibilityState: c.visibilityState,
    }));
    show = NizekSwLib.shouldShowPushNotification(infos);
  }

  const jobs = [];
  if (show) {
    jobs.push(
      self.registration.showNotification(
        data.title,
        NizekSwLib.notificationOptionsFor(data),
      ),
    );
  }
  if (data.badge != null && navigator.setAppBadge) {
    jobs.push(navigator.setAppBadge(data.badge).catch(() => {}));
  }
  await Promise.all(jobs);
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = NizekSwLib.parsePushPayload(event.data.text());
  if (!data) return;
  event.waitUntil(handlePushData(data, {}));
});

// Simulated push from the page (diagnostics panel "Test banner" + E2E tests).
// Runs the exact same display path as a real push event.
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "simulate-push") {
    const data = NizekSwLib.parsePushPayload(JSON.stringify(msg.data ?? {}));
    if (!data) return;
    event.waitUntil(
      handlePushData(data, { forceShow: msg.forceShow === true }),
    );
  }
});

// The push service rotated/expired this device's subscription. Re-subscribe
// with the same key and sync the new endpoint so the device keeps receiving
// pushes without waiting for the next app open.
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSub = event.oldSubscription;
  const appServerKey =
    (oldSub && oldSub.options && oldSub.options.applicationServerKey) || null;
  if (!appServerKey) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey })
      .then((newSub) => {
        const json = newSub.toJSON();
        return fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      })
      .catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
