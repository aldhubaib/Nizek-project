"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Group, Panel, Separator } from "react-resizable-panels";

import { Pane } from "./pane";
import { PaneDrawer } from "./pane-drawer";
import { PaneRouter } from "./pane-router";
import { PaneSheet } from "./pane-sheet";
import { PaneShortcuts } from "./pane-shortcuts";
import { usePaneStore } from "./pane-store";
import { PaneTitle } from "./pane-title";
import { PaneTray } from "./pane-tray";
import { mountKey } from "./pane-url";
import { usePaneLocation } from "./use-pane-location";

const MIN_PANE_PX = 360;

type Mode = "desktop" | "tablet" | "phone";

/** ≥ 1024 two columns; 768–1023 the side pane is a sheet; < 768 a bottom drawer. */
function useViewportMode(): Mode {
  const [mode, setMode] = React.useState<Mode>("desktop");
  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    const read = () => setMode(desktop.matches ? "desktop" : tablet.matches ? "tablet" : "phone");
    read();
    desktop.addEventListener("change", read);
    tablet.addEventListener("change", read);
    return () => {
      desktop.removeEventListener("change", read);
      tablet.removeEventListener("change", read);
    };
  }, []);
  return mode;
}

/**
 * Keeps the store in step with the URL (the URL is the source of truth) and hands it the router.
 * Rendering reads the URL directly through `usePaneLocation`; the store serves the actions.
 */
function useUrlSync({ pathname, search }: { pathname: string; search: string }) {
  const router = useRouter();
  React.useEffect(() => {
    // pane writes only change the query, so the main pane must keep its scroll position
    usePaneStore.getState().setNavigator({
      push: (h) => router.push(h, { scroll: false }),
      replace: (h) => router.replace(h, { scroll: false }),
    });
  }, [router]);
  React.useEffect(() => {
    usePaneStore.getState().setLocation(pathname, search);
  }, [pathname, search]);
}

/** The two columns and the handle; the main pane never remounts when a side pane opens. */
export function PaneLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={null}>
      <PaneColumns>{children}</PaneColumns>
    </React.Suspense>
  );
}

/** The two columns share the width equally whenever a side pane is open. */
const HALF = 50;

/**
 * Each time a side pane opens beside the page, the two columns go back to half and half. The
 * handle still resizes them while that pane stays open; the drag is not kept for the next one.
 *
 * The group remembers the last layout per set of panel ids, so the side column gets a fresh id
 * every time one opens and the group starts it from the panels' default sizes. (Setting the
 * layout from an effect instead would run before the group has registered the new column.)
 */
function useSideId(split: boolean): string {
  const [opens, setOpens] = React.useState(0);
  const [wasSplit, setWasSplit] = React.useState(split);
  if (wasSplit !== split) {
    setWasSplit(split);
    if (split) setOpens((n) => n + 1);
  }
  return `side-${opens}`;
}

function PaneColumns({ children }: { children: React.ReactNode }) {
  const location = usePaneLocation();
  useUrlSync(location);
  const mode = useViewportMode();
  const { stack, at } = location;
  const active = stack[at];
  const split = mode === "desktop" && !!active;
  const sideId = useSideId(split);

  // `max-h-svh` is what keeps the scroll inside each pane: the shell's `main` has no height
  // of its own, so without the cap a long list would make this column (and the window) as
  // tall as its content, and both panes would scroll together.
  return (
    <div className="flex h-svh max-h-svh min-w-0 flex-1 flex-col p-2 md:pl-0">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="main" minSize={split ? MIN_PANE_PX : undefined} defaultSize={split ? HALF : undefined}>
          <Pane side={false} entry={null}>
            {children}
          </Pane>
        </Panel>
        {split && (
          <>
            <Separator
              aria-label="Resize panes"
              className="group/handle relative -mx-[3px] w-[14px] shrink-0 cursor-col-resize outline-none"
            >
              <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded bg-transparent transition-colors group-hover/handle:bg-foreground/30 group-data-[resize-handle-state=drag]/handle:bg-foreground/50" />
            </Separator>
            <Panel id={sideId} minSize={MIN_PANE_PX} defaultSize={HALF}>
              <Pane key={mountKey(active)} side entry={active}>
                <PaneRouter entry={active} />
              </Pane>
            </Panel>
          </>
        )}
      </Group>
      {mode === "desktop" && <PaneTray />}
      {mode === "tablet" && <PaneSheet entry={active} />}
      {mode === "phone" && <PaneDrawer />}
      <PaneShortcuts />
      <PaneTitle />
    </div>
  );
}
