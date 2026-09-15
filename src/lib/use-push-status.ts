"use client";

// Keeps a component in sync with this device's real push state. Permission can
// change outside the app (iOS Settings, Chrome site settings), so a one-shot
// check on mount leaves the toggle stale — this re-reads on permission change
// and whenever the app returns to the foreground.
//
// A minimum interval between refreshes prevents rapid visibilitychange events
// (common on mobile during app-switch animations) from firing multiple
// concurrent getPushStatus() calls.

import { useCallback, useEffect, useRef, useState } from "react";
import { getPushStatus, type PushStatus } from "@/lib/push-client";

const MIN_REFRESH_INTERVAL_MS = 3_000;

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

      const runId = ++runIdRef.current;
      inflightRef.current = true;
      lastRefreshAtRef.current = now;
      setChecking(true);
      try {
        const next = await getPushStatus();
        if (runId === runIdRef.current) setStatus(next);
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
