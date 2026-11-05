"use client";

import { Pin, PinOff, X } from "lucide-react";

import { cn } from "@/next-ui/lib/cn";
import { Button } from "@/next-ui/ui/button";
import { Kbd } from "@/next-ui/ui/kbd";

import { PANE_KINDS, paneTitle, viewTitle } from "./pane-registry";
import type { PaneEntry } from "./pane-url";

export interface PaneTrayItemProps {
  entry: PaneEntry;
  /** 1-based position in the tray; ⌥ + this number switches to it. */
  index: number;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  /** Pinned entries never drop when the tray is full; undefined = no pin control. */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Chip form for the phone drawer: title only, no shortcut. */
  chip?: boolean;
}

const useNoLabel = (): string | undefined => undefined;

/**
 * "Projects" for a section, "Project · <name>" for a record (the label from the screen's cache),
 * "Project · <name> · Road map" for a record's view.
 */
export function useEntryText(entry: PaneEntry): string {
  const useLabel = (entry.id && PANE_KINDS[entry.kind]?.useLabel) || useNoLabel;
  const label = useLabel(entry.id ?? "");
  const title = paneTitle(entry);
  const view = viewTitle(entry);
  return [title, label, view].filter(Boolean).join(" · ");
}

/** One tray entry: its title, its ⌥n shortcut and its own ×. */
export function PaneTrayItem({ entry, index, active, onActivate, onClose, pinned, onTogglePin, chip }: PaneTrayItemProps) {
  const text = useEntryText(entry);

  return (
    <div
      className={cn(
        "group/tray-item flex items-center gap-1 rounded-md text-sm",
        chip ? "shrink-0 border bg-card pl-2.5" : "pl-2 hover:bg-accent/60",
        active && (chip ? "border-foreground/40" : "bg-accent"),
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-current={active ? "true" : undefined}
        title={text}
        className={cn("flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left", chip && "max-w-40")}
      >
        <span className="truncate" dir="auto">
          {text}
        </span>
        {!chip && index <= 8 && <Kbd className="ml-auto shrink-0">⌥{index}</Kbd>}
      </button>
      {!chip && onTogglePin && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pinned ? `Unpin ${text}` : `Pin ${text}`}
          aria-pressed={pinned}
          onClick={onTogglePin}
          className={cn(
            "shrink-0",
            pinned
              ? "text-foreground"
              : "text-muted-foreground opacity-0 group-hover/tray-item:opacity-100 focus-visible:opacity-100",
          )}
        >
          {pinned ? <PinOff /> : <Pin />}
        </Button>
      )}
      <Button variant="ghost" size="icon-xs" aria-label={`Close ${text}`} onClick={onClose} className="shrink-0 text-muted-foreground">
        <X />
      </Button>
    </div>
  );
}
