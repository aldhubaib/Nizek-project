"use client";

// Keeps a component in sync with this device's real push state. Permission can
// change outside the app (iOS Settings, Chrome site settings), so a one-shot
// check on mount leaves the toggle stale — this re-reads on permission change
// and whenever the app returns to the foreground.

import { useCallback, useEffect, useRef, useState } from "react";
import { getPushStatus, type PushStatus } from "@/lib/push-client";

export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [checking, setChecking] = useState(true);
  // Guards against a slow in-flight check overwriting a newer result.
  const runIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const runId = ++runIdRef.current;
    setChecking(true);
    try {
      const next = await getPushStatus();
      if (runId === runIdRef.current) setStatus(next);
    } finally {
      if (runId === runIdRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    // Push state lives entirely in browser APIs and the database, none of it
    // readable during render — the first read can only happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    let permissionStatus: PermissionStatus | null = null;
    const onPermissionChange = () => void refresh();

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
