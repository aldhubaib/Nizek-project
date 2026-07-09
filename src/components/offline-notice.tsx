"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Shows a popup when the device loses its internet connection, and a brief
 * "Back online" confirmation when it returns. Driven by the browser's
 * online/offline events (fired on network state changes).
 */
export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Seed from the current state (navigator.onLine is available client-side).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    const goOffline = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setJustReconnected(false);
      setOffline(true);
    };

    const goOnline = () => {
      setOffline(false);
      setJustReconnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => setJustReconnected(false), 3000);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  if (!offline && !justReconnected) return null;

  return (
    <div className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[9999] flex justify-center animate-in slide-in-from-top-4 fade-in duration-300 sm:inset-x-0">
      {offline ? (
        <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-destructive/40 bg-card px-4 py-3 text-foreground shadow-2xl">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
            <WifiOff className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">You&apos;re offline</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Check your internet connection. We&apos;ll reconnect automatically.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-success/40 bg-card px-4 py-3 text-foreground shadow-2xl">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
            <Wifi className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-sm font-semibold">Back online</div>
        </div>
      )}
    </div>
  );
}
