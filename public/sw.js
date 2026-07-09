// Minimal service worker: Web Push only. Intentionally does NOT cache fetches
// or drive app updates — the in-app UpdateNotifier already handles new versions.

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

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const { title, body, url, badge, icon, tag } = data;
  if (!title) return;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body || "",
        icon: icon || "/favicon.ico",
        badge: "/favicon.ico",
        data: { url: url || "/dashboard" },
        vibrate: [200, 100, 200],
        tag: tag || undefined,
        renotify: !!tag,
      }),
      badge != null && navigator.setAppBadge
        ? navigator.setAppBadge(badge)
        : Promise.resolve(),
    ]),
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
