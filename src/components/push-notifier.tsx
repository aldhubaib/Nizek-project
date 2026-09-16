"use client";

import { useEffect, useState } from "react";
import { pushSupported, syncPushSubscription } from "@/lib/push-client";

/**
 * Registers the push service worker and keeps this device's subscription in
 * sync with the server. It renders nothing: prompting the user to enable
 * notifications is owned by <NotificationGate /> (mandatory, not dismissable),
 * and app updates by <UpdateNotifier />.
 */
export function PushNotifier() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // A controlling SW on localhost can keep Turbopack chunks around after a
    // rebuild ("module factory is not available"). Push belongs in production.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        setRegistration(r);
        if (pushSupported() && Notification.permission === "granted") {
          void syncPushSubscription(r);
        }
      })
      .catch(() => {});
  }, []);

  // Re-sync on every return to the foreground. iOS rotates endpoints whenever
  // it suspends the PWA, so the server can hold a stale subscription after a
  // short absence too. POST /api/push is an idempotent upsert, so the only
  // cost is one small request per foreground.
  useEffect(() => {
    if (!registration || !pushSupported()) return;
    function onVisibility() {
      if (!document.hidden && Notification.permission === "granted") {
        void syncPushSubscription(registration!);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [registration]);

  return null;
}
