"use client";

import * as React from "react";

import { cn } from "@/next-ui/lib/cn";
import { findNav } from "@/next-ui/shell/nav";

import { PaneCrumbs } from "./pane-crumbs";
import { PaneHeader } from "./pane-header";
import { PaneHeaderMore } from "./pane-header-more";
import { PANE_KINDS, paneTitle } from "./pane-registry";
import { usePaneStore } from "./pane-store";
import { entryFromHref, viewKey, type PaneEntry } from "./pane-url";
import { useHeaderOverflow } from "./use-header-overflow";
import { PaneContext } from "./use-pane";
import { usePaneLocation } from "./use-pane-location";
import { usePaneScroll } from "./use-pane-scroll";

const DRAG_TYPE = "application/x-nizek-pane";

export interface PaneProps {
  side: boolean;
  /** The side entry, or `null` for the main pane (which reads the path). */
  entry: PaneEntry | null;
  children: React.ReactNode;
  className?: string;
  /** Overlay hosts (sheet, drawer) draw their own card; the pane then fills them. */
  bare?: boolean;
}

/** One pane: a floating card with a header, a region landmark and its own scroll. */
export function Pane({ side, entry, children, className, bare }: PaneProps) {
  const { pathname, stack } = usePaneLocation();
  const hasSide = stack.length > 0;
  const store = usePaneStore.getState;
  const headerRef = React.useRef<HTMLDivElement>(null);
  const mainEntry = React.useMemo(() => entryFromHref(pathname), [pathname]);
  const shown = side ? entry : mainEntry;
  const title = shown ? paneTitle(shown) : (findNav(pathname)?.title ?? "Page");

  React.useEffect(() => {
    if (side) headerRef.current?.focus({ preventScroll: true });
  }, [side]);

  const canSwap = hasSide && !!mainEntry && mainEntry.kind in PANE_KINDS;
  // one scroll position per page shown: a record's views each keep their own
  const scrollKey = shown ? viewKey(shown) : pathname;
  const { setHeader, setActions, actions, mode } = useHeaderOverflow(scrollKey);
  const [overflow, setOverflow] = React.useState<HTMLDivElement | null>(null);
  const ctx = React.useMemo(
    () => ({ side, entry: side ? entry : null, actions, overflow, mode }),
    [side, entry, actions, overflow, mode],
  );
  const { ref: bodyRef, onScroll } = usePaneScroll(scrollKey);
  const [dropping, setDropping] = React.useState(false);
  const me = side ? "side" : "main";

  return (
    <PaneContext.Provider value={ctx}>
      <section
        role="region"
        aria-label={title}
        data-pane={me}
        data-drop-target={dropping || undefined}
        onDragOver={(e) => {
          if (!canSwap || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          setDropping(false);
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          if (e.dataTransfer.getData(DRAG_TYPE) !== me) store().swap();
        }}
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-background",
          !bare && "rounded-xl border shadow-md",
          dropping && "ring-2 ring-ring",
          className,
        )}
      >
        <PaneHeader
          side={side}
          headerRef={(el) => {
            headerRef.current = el;
            setHeader(el);
          }}
          actionsRef={setActions}
          more={mode === "menu" ? <PaneHeaderMore slotRef={setOverflow} /> : undefined}
          breadcrumb={<PaneCrumbs side={side} entry={shown} pathname={pathname} />}
          onSwap={canSwap ? () => store().swap() : undefined}
          onOpenFull={side ? () => store().openFull() : undefined}
          onClose={side ? () => store().close() : canSwap ? () => store().closeMain() : undefined}
          onDragStart={canSwap ? (e) => e.dataTransfer.setData(DRAG_TYPE, me) : undefined}
        />
        <div ref={bodyRef} onScroll={onScroll} data-pane-body="" className="min-h-0 flex-1 overflow-auto p-6">
          {children}
        </div>
      </section>
    </PaneContext.Provider>
  );
}
