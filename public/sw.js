// Minimal service worker: Web Push only. Intentionally does NOT cache fetches
// or drive app updates — the in-app UpdateNotifier already handles new versions.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
