// Caching half of the service worker: install/activate housekeeping and the
// fetch strategies (sound, static, asset, navigation). Loaded by sw.js via
// importScripts(); decision logic (what to cache, what is cacheable) lives in
// sw-lib.js so it can be unit tested. App updates are owned by the in-app
// UpdateNotifier (it clears every cache except notif-sound-v1 on apply).

/* global NizekSwLib */

(function () {
  "use strict";

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
          (await caches.match("/offline.html")) || (await cache.match("/offline.html"));
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
            await Promise.all(keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k)));
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
})();
