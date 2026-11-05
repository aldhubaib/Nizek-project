"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * `false` on the server and during hydration, `true` afterwards. Anything that comes from
 * localStorage (saved split, recents) must render its server shape until this flips, or the
 * server HTML would not match and React would throw the whole pane tree away.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
