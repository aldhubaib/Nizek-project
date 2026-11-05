"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { PANE_PARAM, parsePane, type PaneEntry } from "./pane-url";

export interface PaneLocationState {
  pathname: string;
  /** `?a=1&pane=…` or "" — as Next reports it. */
  search: string;
  stack: PaneEntry[];
  at: number;
}

/**
 * The URL as the pane system reads it, derived during render from Next's own hooks. Chrome
 * that must be right on the first paint (the breadcrumb, the region labels, whether a side
 * pane exists) reads this, so the server HTML already shows it; the store, which cannot be
 * seeded per request on the server, follows in an effect and serves the actions.
 */
export function usePaneLocation(): PaneLocationState {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.size ? `?${params}` : "";
  const pane = params.get(PANE_PARAM);
  return React.useMemo(() => {
    const parsed = parsePane(pane);
    return { pathname, search, stack: parsed?.stack ?? [], at: parsed?.at ?? 0 };
  }, [pathname, search, pane]);
}
