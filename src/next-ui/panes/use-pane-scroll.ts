"use client";

import * as React from "react";

import { usePaneStore } from "./pane-store";

const RESTORE_WINDOW_MS = 3000;

/**
 * Per-pane remembered scroll. Each pane body remembers its own `scrollTop` under a key (the
 * record or section it shows); when that key is shown again, the body goes back to where it was
 * once the content is tall enough — list data arrives after the first paint.
 */
export function usePaneScroll(key: string): {
  ref: React.RefObject<HTMLDivElement | null>;
  onScroll: React.UIEventHandler<HTMLDivElement>;
} {
  const ref = React.useRef<HTMLDivElement>(null);
  const restoring = React.useRef(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    const want = usePaneStore.getState().scroll[key];
    if (!el || !want) return;
    restoring.current = true;
    const apply = () => {
      el.scrollTop = want;
      if (Math.abs(el.scrollTop - want) < 1) stop();
    };
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchmove", stop);
      restoring.current = false;
    };
    const observer = new ResizeObserver(apply);
    for (const child of Array.from(el.children)) observer.observe(child);
    const timer = window.setTimeout(stop, RESTORE_WINDOW_MS);
    // the user's own scroll wins over the restore
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchmove", stop, { passive: true });
    apply();
    return stop;
  }, [key]);

  const onScroll = React.useCallback<React.UIEventHandler<HTMLDivElement>>(
    (e) => {
      if (!restoring.current) usePaneStore.getState().rememberScroll(key, e.currentTarget.scrollTop);
    },
    [key],
  );
  return { ref, onScroll };
}
