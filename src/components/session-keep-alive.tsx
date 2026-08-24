"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";

const TOUCH_AFTER_MS = 5 * 60 * 1000; // 5 minutes backgrounded

/**
 * Proactively refreshes the Clerk session when the app returns to the
 * foreground after being backgrounded for a while. Without this, iOS PWAs
 * that have been suspended can return with an expired session cookie,
 * causing the next server request to redirect to /sign-in.
 */
export function SessionKeepAlive() {
  const clerk = useClerk();

  useEffect(() => {
    let hiddenAt = 0;

    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt > 0 && Date.now() - hiddenAt > TOUCH_AFTER_MS) {
        clerk.session?.touch().catch(() => {});
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clerk]);

  return null;
}
