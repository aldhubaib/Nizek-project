"use client";

import { useSyncExternalStore } from "react";
import { FINE_POINTER_QUERY, hasFinePointer } from "@/lib/composer-keys";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(FINE_POINTER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True on keyboard-and-mouse devices, false on touch. Live: an iPad that gets
 * a trackpad connected flips without a reload. Always false on the server.
 */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribe, hasFinePointer, () => false);
}
