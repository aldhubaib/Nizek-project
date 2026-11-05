"use client";

import * as React from "react";
import Link from "next/link";

import { isAppHref, paneParamOf, withPane } from "./pane-url";
import { PaneContext, usePane } from "./use-pane";
import { usePaneLocation } from "./use-pane-location";

type LinkProps = Omit<React.ComponentProps<typeof Link>, "href" | "target"> & {
  href: string;
  /** `"pane"` always opens beside; otherwise the usual anchor target. */
  target?: "pane" | React.HTMLAttributeAnchorTarget;
};

/**
 * Next's `Link`, pane-aware (panes brief, decision 8). Plain click navigates the pane it is in —
 * the main pane keeps its side pane open; a click inside the side pane opens a new side entry on
 * top. ⌥-click, middle-click or `target="pane"` open beside from anywhere. ⌘/Ctrl-click still
 * opens a browser tab. Hrefs that have no pane kind yet behave exactly like `Link`.
 */
export function AppLink({ href, target, onClick, onAuxClick, ...props }: LinkProps) {
  const { side } = React.useContext(PaneContext);
  const pane = usePane();
  const paneParam = paneParamOf(usePaneLocation().search);
  const beside = target === "pane";
  const anchorTarget = beside ? undefined : target;

  const inApp = isAppHref(href);
  // keep the side pane when the main pane navigates (also for middle-click / new-tab copies)
  const rendered = inApp && paneParam && !/[?&]pane=/.test(href) ? withPane(href, paneParam) : href;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || anchorTarget === "_blank") return;
    if (!inApp) return;
    if (beside || e.altKey || side) {
      e.preventDefault();
      pane.openSide(href);
    }
  };
  const handleAuxClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onAuxClick?.(e);
    if (e.defaultPrevented || e.button !== 1 || !inApp) return;
    e.preventDefault();
    pane.openSide(href);
  };

  return <Link href={rendered} target={anchorTarget} onClick={handleClick} onAuxClick={handleAuxClick} {...props} />;
}
