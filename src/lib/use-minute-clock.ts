"use client";

import { useEffect, useState } from "react";

// A single shared 60s clock for all live-duration UI (e.g. kanban cards).
// Previously every card ran its own setInterval — on a busy board that was
// hundreds of timers. Here one interval fans out to all subscribers.

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    for (const l of listeners) l();
  }, 60_000);
}

function maybeStop() {
  if (listeners.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Returns a value that increments once per minute while `active` is true, so a
 * component can recompute a live duration. Subscribes to the shared clock only
 * when active (no timer cost for components without durations).
 */
export function useMinuteTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    ensureTimer();
    return () => {
      listeners.delete(listener);
      maybeStop();
    };
  }, [active]);
  return tick;
}
