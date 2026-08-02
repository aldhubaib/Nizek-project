"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

// A HEAD against a static file — no DB, no auth. Any response at all (even a
// 404) proves the network round-trip worked, so the status code is ignored.
const PROBE_PATH = "/favicon.ico";
const PROBE_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 1000;
const RECHECK_INTERVAL_MS = 5000;

async function canReachApp(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${PROBE_PATH}?_=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shows a popup when the app becomes unreachable, and a brief "Back online"
 * confirmation when it returns.
 *
 * The browser's online/offline events are treated as a hint, not the truth:
 * navigator.onLine only reports whether the OS has a network route, so it goes
 * false during Wi-Fi handoffs, VPN toggles and sleep/wake while the connection
 * is actually fine (and stays true on a captive portal with no internet). Every
 * hint is confirmed with a real request before the banner is shown or hidden.
 */
export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineRef = useRef(false);
  const mountedRef = useRef(true);
  // Keeps the interval and the event listeners from probing over each other.
  const probingRef = useRef(false);

  const applyState = useCallback((reachable: boolean) => {
    if (!mountedRef.current || reachable === !offlineRef.current) return;

    if (reachable) {
      offlineRef.current = false;
      setOffline(false);
      setJustReconnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) setJustReconnected(false);
      }, 3000);
    } else {
      offlineRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setJustReconnected(false);
      setOffline(true);
    }
  }, []);

  const verify = useCallback(async () => {
    if (probingRef.current) return;
    probingRef.current = true;
    try {
      let reachable = await canReachApp();
      // Retry once before claiming we're down, so a single dropped request
      // during a blip doesn't flash the banner at someone who is online.
      if (!reachable && !offlineRef.current) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        reachable = await canReachApp();
      }
      applyState(reachable);
    } finally {
      probingRef.current = false;
    }
  }, [applyState]);

  useEffect(() => {
    mountedRef.current = true;

    if (typeof navigator !== "undefined" && !navigator.onLine) void verify();

    const onNetworkChange = () => void verify();
    window.addEventListener("offline", onNetworkChange);
    window.addEventListener("online", onNetworkChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("offline", onNetworkChange);
      window.removeEventListener("online", onNetworkChange);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [verify]);

  // While down, poll for recovery: the "online" event is not guaranteed to fire
  // when connectivity comes back (and never fires if it never really left).
  useEffect(() => {
    if (!offline) return;
    const id = setInterval(() => void verify(), RECHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [offline, verify]);

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
