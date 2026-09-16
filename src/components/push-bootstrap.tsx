"use client";

import { useEffect } from "react";
import { startPushRuntime } from "@/lib/push/store";

/**
 * Mounts the push runtime: service worker registration, first status check,
 * foreground re-verification and device telemetry. Renders nothing; the
 * NotificationGate and the account card read the same store.
 */
export function PushBootstrap() {
  useEffect(() => {
    startPushRuntime();
  }, []);
  return null;
}
