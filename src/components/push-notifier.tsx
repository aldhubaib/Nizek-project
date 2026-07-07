"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { pushSupported, syncPushSubscription } from "@/lib/push-client";

const PUSH_DISMISSED_KEY = "nizek-push-dismissed-at";
const PUSH_DISMISS_DAYS = 14;

/**
 * Registers the push service worker and, when notifications haven't been
 * decided yet, prompts the user to enable them with a bottom banner. App
 * updates are handled separately by <UpdateNotifier />.
 */
export function PushNotifier() {
  const [showEnablePush, setShowEnablePush] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  // The permission request MUST run inside this click handler: iOS ignores
  // Notification.requestPermission() outside a user gesture (silently returns
  // "denied"), and Android demotes it to a quiet prompt nobody sees.
  const handleEnablePush = useCallback(() => {
    setShowEnablePush(false);
    if (!registration) return;
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") void syncPushSubscription(registration);
      else localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));
    });
  }, [registration]);

  const handleDismissPush = useCallback(() => {
    setShowEnablePush(false);
    localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        setRegistration(r);

        if (!pushSupported()) return;

        if (Notification.permission === "granted") {
          // Already allowed — refresh the subscription silently each session so
          // the server always has a working endpoint for this device.
          void syncPushSubscription(r);
        } else if (Notification.permission === "default") {
          const dismissedAt = Number(
            localStorage.getItem(PUSH_DISMISSED_KEY) ?? 0,
          );
          const askAgainAfter =
            dismissedAt + PUSH_DISMISS_DAYS * 24 * 60 * 60 * 1000;
          if (Date.now() > askAgainAfter) setShowEnablePush(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!showEnablePush) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-[9999] flex justify-center animate-in slide-in-from-bottom-4 fade-in duration-300 sm:inset-x-0">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground shadow-2xl">
        <Bell className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          Get notified about new messages
        </span>
        <button
          onClick={handleEnablePush}
          className="flex h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Enable
        </button>
        <button
          onClick={handleDismissPush}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
