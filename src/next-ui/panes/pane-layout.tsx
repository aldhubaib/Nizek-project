"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";

import { Pane } from "./pane";
import { PaneDrawer } from "./pane-drawer";
import { PaneRouter } from "./pane-router";
import { PaneSheet } from "./pane-sheet";
import { PaneShortcuts } from "./pane-shortcuts";
import { DEFAULT_SIZES, usePaneStore } from "./pane-store";
import { PaneTitle } from "./pane-title";
import { PaneTray } from "./pane-tray";
import { mountKey } from "./pane-url";
import { useHydrated } from "./use-hydrated";
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

/**
 * The saved split lives in localStorage, which the server cannot read. Both panes are already
 * in the server HTML, so the first render uses the default split on both sides (no hydration
 * mismatch); the group's first measured layout is then swapped for the saved one instead of
 * being saved. Side panes opened later mount with the saved `defaultSize`.
 */
function useSavedSplit(splitOnFirstRender: boolean) {
  const groupRef = useGroupRef();
  const hydrated = useHydrated();
  const saved = usePaneStore((s) => s.sizes);
  const pending = React.useRef(splitOnFirstRender);
  const onLayoutChanged = (layout: Record<string, number>) => {
    if (typeof layout.main !== "number" || typeof layout.side !== "number") return;
    if (pending.current) {
      pending.current = false;
      const { main, side } = usePaneStore.getState().sizes;
      if (main !== layout.main || side !== layout.side) {
        groupRef.current?.setLayout({ main, side });
        return;
      }
    }
    usePaneStore.getState().setSizes({ main: layout.main, side: layout.side });
  };
  return { groupRef, onLayoutChanged, sizes: hydrated ? saved : DEFAULT_SIZES };
}

function PaneColumns({ children }: { children: React.ReactNode }) {
  const location = usePaneLocation();
  useUrlSync(location);
  const mode = useViewportMode();
  const { stack, at } = location;
  const active = stack[at];
  const split = mode === "desktop" && !!active;
  const { groupRef, onLayoutChanged, sizes } = useSavedSplit(split);

  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col p-2 md:pl-0">
      <Group
        groupRef={groupRef}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={{ main: sizes.main, side: sizes.side }}
        onLayoutChanged={onLayoutChanged}
      >
        <Panel id="main" minSize={split ? MIN_PANE_PX : undefined} defaultSize={split ? sizes.main : undefined}>
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
            <Panel id="side" minSize={MIN_PANE_PX} defaultSize={sizes.side}>
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
