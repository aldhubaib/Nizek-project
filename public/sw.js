// Service worker: Web Push + notification-sound caching + safe app-shell
// caching. App updates are still owned by the in-app UpdateNotifier (it
// clears every cache except notif-sound-v1 on apply).
// Decision logic lives in sw-lib.js so it can be unit tested.

/* global NizekSwLib */
importScripts("/sw-lib.js");

var CACHE = NizekSwLib.CACHE_NAMES;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE.assets).then((cache) => cache.add("/offline.html").catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      var keep = new Set(NizekSwLib.knownCacheNames());
      var keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      var assets = await caches.open(CACHE.assets);
      if (!(await assets.match("/offline.html"))) {
        await assets.add("/offline.html").catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(cacheName, req, strategy) {
  var cache = await caches.open(cacheName);
  var cached = await cache.match(req);
  if (cached) return cached;
  try {
    var res = await fetch(req);
    if (NizekSwLib.isCacheableResponse(res, strategy)) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    var fallback = await cache.match(req, { ignoreSearch: strategy === "sound" });
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(cacheName, req, event) {
  var cache = await caches.open(cacheName);
  var cached = await cache.match(req);
  var network = fetch(req)
    .then((res) => {
      if (NizekSwLib.isCacheableResponse(res, "asset")) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    if (event && event.waitUntil) event.waitUntil(network);
    return cached;
  }
  var res = await network;
  return res || Response.error();
}

async function networkFirstNav(req) {
  var cache = await caches.open(CACHE.navigation);
  try {
    var res = await fetch(req);
    if (NizekSwLib.isCacheableResponse(res, "navigation")) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    var cached = await cache.match(req);
    if (cached) return cached;
    var dest = req.headers.get("Sec-Fetch-Dest");
    if (req.mode === "navigate" || dest === "document") {
      var offline =
        (await caches.match("/offline.html")) ||
        (await cache.match("/offline.html"));
      if (offline) return offline;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  var req = event.request;
  var strategy = NizekSwLib.classifyRequest(req, self.location.origin);
  if (!strategy) return;

  if (strategy === "sound") {
    event.respondWith(
      caches.open(CACHE.sound).then(async (cache) => {
        var cached = await cache.match(req);
        if (cached) return cached;
        try {
          var res = await fetch(req);
          // Keep only the current sound to bound cache size (URLs change per upload).
          var keys = await cache.keys();
          await Promise.all(
            keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k)),
          );
          if (NizekSwLib.isCacheableResponse(res, "sound")) {
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          var fallback = await cache.match(req, { ignoreSearch: true });
          return fallback || Response.error();
        }
      }),
    );
    return;
  }

  if (strategy === "static") {
    event.respondWith(cacheFirst(CACHE.static, req, "static"));
    return;
  }

  if (strategy === "asset") {
    event.respondWith(staleWhileRevalidate(CACHE.assets, req, event));
    return;
  }

  if (strategy === "navigation") {
    event.respondWith(networkFirstNav(req));
  }
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
        // deviceId lives in localStorage (unreachable from a SW); the next app
        // open backfills it via syncPushSubscription. userAgent IS available.
        return fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            userAgent: navigator.userAgent,
          }),
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
