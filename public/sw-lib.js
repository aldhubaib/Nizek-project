// Pure decision logic for the service worker. Loaded into sw.js via
// importScripts() and unit-tested directly (CommonJS export at the bottom).
// No SW globals may be referenced here — everything is passed in.

(function (root) {
  "use strict";

  var CACHE_NAMES = {
    sound: "notif-sound-v1",
    static: "nizek-static-v1",
    assets: "nizek-asset-v1",
    navigation: "nizek-nav-v1",
  };

  var SAFE_ASSET_EXT = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

  /** Parses a push event's JSON payload. Returns null when unusable. */
  function parsePushPayload(rawText) {
    if (!rawText) return null;
    var data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return null;
    }
    if (!data || typeof data !== "object" || !data.title) return null;
    return {
      title: String(data.title),
      body: typeof data.body === "string" ? data.body : "",
      url: typeof data.url === "string" && data.url ? data.url : "/dashboard",
      badge: typeof data.badge === "number" ? data.badge : null,
      tag: typeof data.tag === "string" && data.tag ? data.tag : null,
      icon: typeof data.icon === "string" && data.icon ? data.icon : null,
    };
  }

  /**
   * WhatsApp behavior: suppress the OS banner only when the user is actively
   * looking at the app on THIS device — i.e. some window client is focused AND
   * visible. Backgrounded/minimized tabs still get the OS banner (with the OS
   * notification sound).
   */
  function shouldShowPushNotification(clientInfos) {
    if (!Array.isArray(clientInfos)) return true;
    for (var i = 0; i < clientInfos.length; i++) {
      var c = clientInfos[i];
      if (c && c.focused === true && c.visibilityState === "visible") {
        return false;
      }
    }
    return true;
  }

  /** Options object for registration.showNotification(). */
  function notificationOptionsFor(data) {
    return {
      body: data.body || "",
      icon: data.icon || "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url || "/dashboard" },
      vibrate: [200, 100, 200],
      tag: data.tag || undefined,
      renotify: !!data.tag,
      // Explicitly NOT silent: the OS notification sound is the primary sound
      // channel when the app isn't focused.
      silent: false,
    };
  }

  function headerGet(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === "function") {
      try {
        return headers.get(name);
      } catch {
        return null;
      }
    }
    var lower = String(name).toLowerCase();
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
        return headers[key];
      }
    }
    return null;
  }

  function knownCacheNames() {
    return [
      CACHE_NAMES.sound,
      CACHE_NAMES.static,
      CACHE_NAMES.assets,
      CACHE_NAMES.navigation,
    ];
  }

  function isDashboardPath(pathname) {
    return pathname === "/dashboard" || pathname.indexOf("/dashboard/") === 0;
  }

  function isExcludedApiPath(pathname) {
    return (
      pathname.indexOf("/api/") === 0 ||
      pathname.indexOf("/sign-in") === 0 ||
      pathname.indexOf("/sign-up") === 0
    );
  }

  function looksLikeNavigation(req, url) {
    var dest = headerGet(req.headers, "Sec-Fetch-Dest");
    var mode = headerGet(req.headers, "Sec-Fetch-Mode") || req.mode;
    var accept = headerGet(req.headers, "Accept") || "";
    var rsc =
      headerGet(req.headers, "RSC") === "1" ||
      headerGet(req.headers, "Next-Url") != null ||
      headerGet(req.headers, "Next-Router-State-Tree") != null ||
      headerGet(req.headers, "Next-Router-Prefetch") != null ||
      (url.searchParams && url.searchParams.has("_rsc"));
    if (rsc) return true;
    if (dest === "document" || mode === "navigate") return true;
    if (typeof accept === "string" && accept.indexOf("text/html") !== -1) return true;
    return false;
  }

  /**
   * Classify a fetch for the service worker.
   * Returns one of: "sound" | "static" | "asset" | "navigation" | null.
   * null means do not intercept (network as usual, nothing cached).
   *
   * `req` is request-like: { method, url, headers, cache, mode }.
   * `selfOrigin` is the SW origin; cross-origin is ignored except sounds.
   */
  function classifyRequest(req, selfOrigin) {
    if (!req) return null;
    var method = String(req.method || "GET").toUpperCase();
    if (method !== "GET") return null;

    var cacheMode = req.cache || "";
    if (cacheMode === "no-store" || cacheMode === "reload") return null;

    if (headerGet(req.headers, "Next-Action")) return null;

    var url;
    try {
      url = new URL(req.url);
    } catch {
      return null;
    }

    var pathname = url.pathname;
    var sameOrigin = !selfOrigin || url.origin === selfOrigin;

    if (pathname.indexOf("/notification_sound/") !== -1) {
      if (headerGet(req.headers, "Range") || headerGet(req.headers, "range")) {
        return null;
      }
      return "sound";
    }

    if (!sameOrigin) return null;

    if (pathname === "/sw.js" || pathname === "/sw-lib.js") return null;

    if (isExcludedApiPath(pathname)) return null;

    if (pathname.indexOf("/_next/static/") === 0) return "static";

    if (pathname.indexOf("/_next/") === 0) return null;

    if (
      pathname === "/manifest.json" ||
      pathname === "/offline.html" ||
      pathname === "/favicon.ico" ||
      pathname.indexOf("/icon-") === 0 ||
      pathname.indexOf("/apple-touch-icon") === 0 ||
      pathname.indexOf("/pwa-icons/") === 0 ||
      pathname.indexOf("/branding-defaults/") === 0 ||
      SAFE_ASSET_EXT.test(pathname)
    ) {
      return "asset";
    }

    if (isDashboardPath(pathname) && looksLikeNavigation(req, url)) {
      return "navigation";
    }

    return null;
  }

  /**
   * Whether a Response is safe to put in a cache.
   * Never stores redirects (auth), errors, or partial media.
   */
  function isCacheableResponse(res, strategy) {
    if (!res) return false;
    if (res.status === 206) return false;
    if (strategy === "sound") {
      return res.ok === true || res.type === "opaque";
    }
    if (!res.ok) return false;
    if (res.redirected) return false;
    var t = res.type;
    if (t && t !== "basic" && t !== "cors" && t !== "default") return false;
    return true;
  }

  var api = {
    CACHE_NAMES: CACHE_NAMES,
    parsePushPayload: parsePushPayload,
    shouldShowPushNotification: shouldShowPushNotification,
    notificationOptionsFor: notificationOptionsFor,
    classifyRequest: classifyRequest,
    isCacheableResponse: isCacheableResponse,
    knownCacheNames: knownCacheNames,
  };

  // Service worker / browser global.
  root.NizekSwLib = api;

  // Node (unit tests).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
