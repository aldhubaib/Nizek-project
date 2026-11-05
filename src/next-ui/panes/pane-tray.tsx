"use client";

import * as React from "react";
import { Layers2 } from "lucide-react";

import { Button } from "@/next-ui/ui/button";

import { usePaneStore } from "./pane-store";
import { PaneTrayItem } from "./pane-tray-item";
import { entryKey } from "./pane-url";
import { usePaneLocation } from "./use-pane-location";

/**
 * The rail of every other open side entry: a 24 px strip hugging the right edge, vertically
 * centred; hover or focus expands it to the list with ⌥n shortcuts and Close all. Rendered only
 * when more than one entry is open.
 */
export function PaneTray() {
  const { stack, at } = usePaneLocation();
  const pins = usePaneStore((s) => s.pins);
  const store = usePaneStore.getState;
  const [open, setOpen] = React.useState(false);
  if (stack.length < 2) return null;

  return (
    <div
      data-pane-tray=""
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      className="fixed top-1/2 right-0 z-30 flex max-h-[min(480px,70vh)] -translate-y-1/2 items-stretch"
    >
      {open ? (
        <div
          role="list"
          aria-label="Open panes"
          className="mr-2 flex w-72 flex-col gap-0.5 overflow-auto rounded-2xl border bg-popover/90 p-1.5 shadow-lg backdrop-blur"
        >
          <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
            <span>
              {stack.length} open · ⌥1–{Math.min(stack.length, 8)}
            </span>
            <Button variant="ghost" size="xs" onClick={() => store().closeAll()}>
              Close all
            </Button>
          </div>
          {stack.map((e, i) => (
            <div role="listitem" key={entryKey(e)}>
              <PaneTrayItem
                entry={e}
                index={i + 1}
                active={i === at}
                onActivate={() => store().activate(i)}
                onClose={() => store().close(i)}
                pinned={pins.includes(entryKey(e))}
                onTogglePin={() => store().togglePin(entryKey(e))}
              />
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          aria-label={`${stack.length} open panes`}
          onClick={() => setOpen(true)}
          className="flex w-6 flex-col items-center justify-center gap-1 rounded-l-2xl border border-r-0 bg-popover/80 py-3 text-muted-foreground shadow backdrop-blur hover:text-foreground"
        >
          <Layers2 className="size-3.5" />
          <span className="text-[10px] tabular-nums">{stack.length}</span>
        </button>
      )}
    </div>
  );
}
