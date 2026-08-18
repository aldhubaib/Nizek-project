// Pure decision logic for the service worker. Loaded into sw.js via
// importScripts() and unit-tested directly (CommonJS export at the bottom).
// No SW globals may be referenced here — everything is passed in.

(function (root) {
  "use strict";

  /** Parses a push event's JSON payload. Returns null when unusable. */
  function parsePushPayload(rawText) {
    if (!rawText) return null;
    var data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
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

  var api = {
    parsePushPayload: parsePushPayload,
    shouldShowPushNotification: shouldShowPushNotification,
    notificationOptionsFor: notificationOptionsFor,
  };

  // Service worker / browser global.
  root.NizekSwLib = api;

  // Node (unit tests).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
