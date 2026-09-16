// @BUILD_VERSION
// Service worker entry: Web Push display, subscription rotation, and
// notification clicks. Caching lives in sw-cache.js, pure decision logic in
// sw-lib.js (unit tested). The @BUILD_VERSION line above is stamped at build
// so every deploy changes this file byte-for-byte and browsers pick up the
// new worker.

/* global NizekSwLib */
importScripts("/sw-lib.js", "/sw-cache.js");

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
      self.registration.showNotification(data.title, NizekSwLib.notificationOptionsFor(data)),
    );
  }
  if (data.badge != null && navigator.setAppBadge) {
    jobs.push(navigator.setAppBadge(data.badge).catch(() => {}));
  }
  await Promise.all(jobs);
}

self.addEventListener("push", (event) => {
  // iOS aggressively terminates SWs. Always call waitUntil — even on parse
  // failure — with a showNotification fallback so the SW stays alive long
  // enough to avoid silent failures and the browser doesn't penalize us for
  // receiving a push without showing a notification.
  const work = (async () => {
    try {
      const raw = event.data ? event.data.text() : null;
      const data = raw ? NizekSwLib.parsePushPayload(raw) : null;
      if (data) {
        await handlePushData(data, {});
      } else {
        await self.registration.showNotification("Nizek Project", {
          body: "You have a new notification",
          data: { url: "/dashboard" },
        });
      }
    } catch {
      await self.registration.showNotification("Nizek Project", {
        body: "You have a new notification",
        data: { url: "/dashboard" },
      });
    }
  })();
  event.waitUntil(work);
});

// Simulated push from the page (account card confirmation + E2E tests).
// Runs the exact same display path as a real push event.
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "simulate-push") {
    const data = NizekSwLib.parsePushPayload(JSON.stringify(msg.data ?? {}));
    if (!data) return;
    event.waitUntil(handlePushData(data, { forceShow: msg.forceShow === true }));
  }
});

// The push service rotated/expired this device's subscription. Re-subscribe
// with the same key and sync the new endpoint — including the OLD endpoint so
// the server retires that row now instead of after a 410. If no replacement
// can be created, tell the server the old endpoint is dead.
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSub = event.oldSubscription;
  const oldEndpoint = oldSub ? oldSub.endpoint : null;
  const appServerKey =
    (oldSub && oldSub.options && oldSub.options.applicationServerKey) || null;

  const work = (async () => {
    if (!appServerKey) return;
    let newSub = null;
    try {
      newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    } catch {
      newSub = null;
    }

    if (!newSub) {
      if (oldEndpoint) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: oldEndpoint }),
        }).catch(() => {});
      }
      return;
    }

    const body = NizekSwLib.subscriptionChangeBody(
      newSub.toJSON(),
      oldEndpoint,
      navigator.userAgent,
    );
    if (!body) return;
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  })();

  event.waitUntil(work);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
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
