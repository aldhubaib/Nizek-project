"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section of the portfolio page, folded away until asked for. The header
 * carries enough — a count, a total, a status — to decide whether opening it is
 * worth it, so a page of these reads as a summary rather than a wall.
 *
 * Collapsing unmounts the body, so anything mid-edit inside has to hold the
 * card open through `forceOpen` rather than rely on the user leaving it alone.
 */
export function CollapsibleCard({
  icon: Icon,
  title,
  summary,
  description,
  actions,
  forceOpen = false,
  defaultOpen = false,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** The one-line "is there anything in here" hint, shown beside the title. */
  summary?: ReactNode;
  description: ReactNode;
  /** Buttons for the header, revealed with the body. */
  actions?: ReactNode;
  forceOpen?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = open || forceOpen;

  return (
    <div
      className={cn(
        "app-card rounded-xl border border-border bg-card/50 p-5 mb-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 min-w-0 text-start"
        >
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0",
              expanded && "rotate-90",
            )}
            strokeWidth={1.5}
          />
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
          <h2 className="text-s font-semibold text-foreground whitespace-nowrap">
            {title}
          </h2>
          {summary != null && (
            <span className="text-xs text-muted-foreground/60 tabular-nums truncate">
              {summary}
            </span>
          )}
        </button>
        {expanded && actions}
      </div>

      {expanded && (
        <>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {description}
          </p>
          {children}
        </>
      )}
    </div>
  );
}
