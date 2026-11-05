"use client";

import * as React from "react";

/** The breadcrumb never gets less than this; below it the page actions move to the More menu. */
const MIN_CRUMB_PX = 120;
const SLACK_PX = 24;

/**
 * Decides whether a pane's page actions fit in its header. The actions' row width is measured
 * while they are in the header and kept; in menu mode the header only has to grow back past it.
 * `resetKey` (what the pane shows) starts a fresh measurement, since the actions changed too.
 */
export function useHeaderOverflow(resetKey: string) {
  const [header, setHeader] = React.useState<HTMLDivElement | null>(null);
  const [actions, setActions] = React.useState<HTMLDivElement | null>(null);
  const [mode, setMode] = React.useState<"header" | "menu">("header");
  const [measuredFor, setMeasuredFor] = React.useState(resetKey);
  const needed = React.useRef(0);
  if (measuredFor !== resetKey) {
    // the pane shows something else now: back to the header, where the width is measured afresh
    setMeasuredFor(resetKey);
    setMode("header");
  }

  React.useEffect(() => {
    if (!header || !actions) return;
    const check = () => {
      if (mode === "header") needed.current = actions.scrollWidth;
      let others = 0;
      for (const child of header.children) {
        if (child !== actions && !child.hasAttribute("data-pane-crumbs")) {
          others += child.getBoundingClientRect().width;
        }
      }
      const available = header.clientWidth - others - MIN_CRUMB_PX - SLACK_PX;
      setMode(needed.current > available ? "menu" : "header");
    };
    const ro = new ResizeObserver(check);
    ro.observe(header);
    ro.observe(actions);
    check();
    return () => ro.disconnect();
  }, [header, actions, mode]);

  return { setHeader, setActions, actions, mode };
}
