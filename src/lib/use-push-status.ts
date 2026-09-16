"use client";

// Keeps a component in sync with this device's real push state. Permission can
// change outside the app (iOS Settings, Chrome site settings), so a one-shot
// check on mount leaves the toggle stale — this re-reads on permission change
// and whenever the app returns to the foreground.
//
// A minimum interval between refreshes prevents rapid visibilitychange events
// (common on mobile during app-switch animations) from firing multiple
// concurrent getPushStatus() calls.
//
// The hook caches the last successful PushStatus in localStorage with a 5-min
// TTL. On visibilitychange we read the cache first and only hit the server when
// expired or when the browser-level permission changed since the last check.

import { useCallback, useEffect, useRef, useState } from "react";
import { getPushStatus, syncPushSubscription, type PushStatus } from "@/lib/push-client";

const MIN_REFRESH_INTERVAL_MS = 3_000;

// On iOS PWA, getPushStatus() can hang forever when the service worker is in a
// zombie state after a cold start (pushManager.getSubscription() or fetch never
// settle). This timeout ensures the spinner always stops.
const STATUS_TIMEOUT_MS = 15_000;

// ─── localStorage cache ─────────────────────────────────────────────────────

const STATUS_CACHE_KEY = "nizek:push-status";
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedStatus {
  status: PushStatus;
  permission: NotificationPermission | "unsupported";
  ts: number;
}

function readCachedStatus(): PushStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedStatus = JSON.parse(raw);
    if (Date.now() - cached.ts > STATUS_CACHE_TTL_MS) return null;
    // Invalidate if the browser-level permission changed since we cached.
    const currentPerm =
      typeof Notification !== "undefined"
        ? Notification.permission
        : "unsupported";
    if (currentPerm !== cached.permission) return null;
    return cached.status;
  } catch {
    return null;
  }
}

function writeCachedStatus(status: PushStatus): void {
  try {
    const entry: CachedStatus = {
      status,
      permission:
        typeof Notification !== "undefined"
          ? Notification.permission
          : "unsupported",
      ts: Date.now(),
    };
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage may be full or disabled (private browsing).
  }
}

export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [checking, setChecking] = useState(true);
  // Guards against a slow in-flight check overwriting a newer result.
  const runIdRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const inflightRef = useRef(false);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      // Throttle: skip if a refresh ran recently, unless forced.
      const now = Date.now();
      if (
        !opts?.force &&
        inflightRef.current
      ) {
        return;
      }
      if (
        !opts?.force &&
        now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS
      ) {
        return;
      }

      // Non-forced refresh (e.g. visibilitychange): try the localStorage cache
      // first to avoid a network round-trip.
      if (!opts?.force) {
        const cached = readCachedStatus();
        if (cached) {
          setStatus(cached);
          setChecking(false);
          return;
        }
      }

      const runId = ++runIdRef.current;
      inflightRef.current = true;
      lastRefreshAtRef.current = now;
      setChecking(true);
      try {
        // Race against a timeout so the spinner always stops, even when iOS
        // hangs on pushManager.getSubscription() or a fetch() never settles.
        const next = await Promise.race([
          getPushStatus(),
          new Promise<null>((r) => setTimeout(() => r(null), STATUS_TIMEOUT_MS)),
        ]);
        if (runId === runIdRef.current) {
          if (next) {
            setStatus(next);
            writeCachedStatus(next);
          }

          // Self-heal: permission is granted but getPushStatus() timed out or
          // came back with no subscription. Re-register the SW + subscription
          // in the background so push delivery resumes without the user having
          // to manually re-toggle.
          if (
            !next &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            syncPushSubscription()
              .then(() => refresh({ force: true }))
              .catch(() => {});
          }
        }
      } finally {
        if (runId === runIdRef.current) {
          setChecking(false);
          inflightRef.current = false;
        }
      }
    },
    [],
  );

  useEffect(() => {
    // Push state lives entirely in browser APIs and the database, none of it
    // readable during render — the first read can only happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh({ force: true });

    let permissionStatus: PermissionStatus | null = null;
    const onPermissionChange = () => void refresh({ force: true });

    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        // Not in every lib.dom version's PermissionName union.
        .query({ name: "notifications" as PermissionName })
        .then((result) => {
          permissionStatus = result;
          result.addEventListener("change", onPermissionChange);
        })
        .catch(() => {
          // Safari/iOS don't expose the notifications permission here; the
          // visibilitychange path below covers those.
        });
    }

    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      permissionStatus?.removeEventListener("change", onPermissionChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { status, checking, refresh, setStatus };
}
