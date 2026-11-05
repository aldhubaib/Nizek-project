"use client";

import * as React from "react";
import { ArrowLeftRight, Maximize2, X } from "lucide-react";

import { cn } from "@/next-ui/lib/cn";
import { Button } from "@/next-ui/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

export interface PaneHeaderProps {
  /** The pane's own breadcrumb (section › record). */
  breadcrumb: React.ReactNode;
  /** Receives the actions slot: the page's search and primary action land here via `PaneHeaderPortal`. */
  actionsRef?: React.Ref<HTMLDivElement>;
  /** The "More" button, when the page actions do not fit. */
  more?: React.ReactNode;
  side: boolean;
  /** Undefined = the button is not shown; the main pane hides Swap when nothing is beside it. */
  onSwap?: () => void;
  onOpenFull?: () => void;
  /** Undefined = no ×; the main pane gets one only while a side pane is visible (it takes its place). */
  onClose?: () => void;
  /** Set = the header is a drag handle (drop it on the other pane to swap). */
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  headerRef?: React.Ref<HTMLDivElement>;
}

/**
 * The 48 px chrome on top of every pane (panes brief, decision 3). It takes slots and knows
 * nothing about what the pane shows.
 */
export function PaneHeader({
  breadcrumb,
  actionsRef,
  more,
  side,
  onSwap,
  onOpenFull,
  onClose,
  onDragStart,
  headerRef,
}: PaneHeaderProps) {
  // the header is the drag handle, but a search field or button inside it is not
  const [armed, setArmed] = React.useState(true);
  return (
    <div
      ref={headerRef}
      tabIndex={-1}
      data-pane-header=""
      draggable={!!onDragStart && armed}
      onPointerDown={(e) =>
        setArmed(!(e.target as HTMLElement).closest("button, input, a, [data-pane-header-actions]"))
      }
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.dataTransfer.effectAllowed = "move";
        onDragStart(e);
      }}
      className={cn(
        // a container: below @sm the breadcrumb keeps its icon and hides its words (PaneCrumbs)
        "@container/header flex h-12 shrink-0 items-center gap-2 border-b px-3 outline-none",
        onDragStart && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div data-pane-crumbs="" className="min-w-0 flex-auto">
        {breadcrumb}
      </div>
      <div ref={actionsRef} data-pane-header-actions="" className="flex min-w-0 items-center gap-1.5 empty:hidden" />
      {more}
      {onSwap && (
        <IconAction label={side ? "Swap with main pane" : "Swap with side pane"} keys="⌥⇧S" onClick={onSwap}>
          <ArrowLeftRight />
        </IconAction>
      )}
      {side && onOpenFull && (
        <IconAction label="Open full" onClick={onOpenFull}>
          <Maximize2 />
        </IconAction>
      )}
      {onClose && (
        <IconAction label="Close pane" keys={side ? "⌥W" : undefined} onClick={onClose}>
          <X />
        </IconAction>
      )}
    </div>
  );
}

function IconAction({
  label,
  keys,
  onClick,
  children,
}: {
  label: string;
  keys?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{keys ? `${label} · ${keys}` : label}</TooltipContent>
    </Tooltip>
  );
}
