"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { isPaneKind } from "./pane-registry";
import { usePaneStore } from "./pane-store";
import {
  SECTIONS,
  entryFromHref,
  hrefFromEntry,
  isAppHref,
  paneParamOf,
  withPane,
  type PaneEntry,
} from "./pane-url";

/** Which pane a component is rendered in; `Pane` provides it, the main pane is the default. */
export interface PaneContextValue {
  side: boolean;
  entry: PaneEntry | null;
  /** The header's actions slot, once mounted; `PaneHeaderPortal` renders page actions into it. */
  actions: HTMLElement | null;
  /** The "More" menu's slot, open only; page actions go here when the header is too narrow. */
  overflow: HTMLElement | null;
  mode: "header" | "menu";
}

export const PaneContext = React.createContext<PaneContextValue>({
  side: false,
  entry: null,
  actions: null,
  overflow: null,
  mode: "header",
});

export interface PaneLocation {
  pathname: string;
  search: string;
  href: string;
  side: boolean;
}

export interface PaneApi {
  location: PaneLocation;
  /** Go somewhere in *this* pane. In the main pane the side pane stays open. `scroll` is Next's. */
  navigate: (href: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
  /** Open beside: a new side entry on top; hrefs without a pane kind navigate the main pane. */
  openSide: (href: string) => void;
  /** Close the visible side pane. */
  close: () => void;
  /** Exchange the two panes. */
  swap: () => void;
  /** What a page's "Back" button does: history back in the main pane, close in the side pane. */
  back: () => void;
}

/** A section entry's own page query (`status=late`), empty for records. */
function sectionQuery(entry: PaneEntry | null): string {
  return entry && entry.kind in SECTIONS && entry.id ? entry.id : "";
}

/** Everything a screen may do with the router (panes brief, decision 8). */
export function usePane(): PaneApi {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.size ? `?${params}` : "";
  const ctx = React.useContext(PaneContext);

  return React.useMemo<PaneApi>(() => {
    const pane = paneParamOf(search);
    const sideHref = ctx.entry ? hrefFromEntry(ctx.entry) : pathname;
    const location: PaneLocation = ctx.side
      ? {
          pathname: sideHref.split("?")[0],
          search: sectionQuery(ctx.entry) ? `?${sectionQuery(ctx.entry)}` : "",
          href: sideHref,
          side: true,
        }
      : { pathname, search, href: `${pathname}${search}`, side: false };

    const goMain = (href: string, opts?: { replace?: boolean; scroll?: boolean }) => {
      const target = isAppHref(href) && !/[?&]pane=/.test(href) ? withPane(href, pane) : href;
      const navOpts = opts?.scroll === undefined ? undefined : { scroll: opts.scroll };
      if (opts?.replace) router.replace(target, navOpts);
      else router.push(target, navOpts);
    };
    const paneEntry = (href: string) => {
      const e = entryFromHref(href);
      return e && isPaneKind(e.kind) ? e : null;
    };

    return {
      location,
      navigate: (href, opts) => {
        const e = ctx.side ? paneEntry(href) : null;
        if (e) usePaneStore.getState().replaceActive(e);
        else goMain(href, opts);
      },
      openSide: (href) => {
        const e = paneEntry(href);
        if (e) usePaneStore.getState().open(e);
        else goMain(href);
      },
      close: () => usePaneStore.getState().close(),
      swap: () => usePaneStore.getState().swap(),
      back: () => (ctx.side ? usePaneStore.getState().close() : router.back()),
    };
  }, [ctx.side, ctx.entry, pathname, search, router]);
}

/**
 * The page query a screen should read: Next's own in the main pane; in the side pane the
 * entry's own query (`projects:status=late` → `status=late`), so a section keeps its tabs and
 * filters when it is open beside something else.
 */
export function usePaneSearchParams(): URLSearchParams {
  const params = useSearchParams();
  const ctx = React.useContext(PaneContext);
  return React.useMemo(() => {
    if (!ctx.side) return params;
    return new URLSearchParams(sectionQuery(ctx.entry));
  }, [ctx.side, ctx.entry, params]);
}
