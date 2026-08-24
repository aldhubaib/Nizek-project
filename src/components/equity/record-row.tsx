"use client";

import { useState, memo, type ReactNode } from "react";
import { ChevronRight, MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * One saved record in a list of them — a contract, a quarter's figures, a dated
 * equity split. Every section that holds more than one of something renders its
 * records through this, so they all read the same way: a line you can scan, and
 * an arrow when there is more behind it.
 *
 * What belongs on the line is what tells one record from another — its name, its
 * state, its date. Everything else waits inside. A record with nothing further
 * to show gets no arrow rather than an empty panel.
 */
export const RecordRow = memo(function RecordRow({
  index,
  title,
  badges,
  meta,
  actions,
  defaultOpen = false,
  className,
  children,
}: {
  /** Position in the list, when the order is part of reading it. */
  index?: number;
  title: ReactNode;
  /** Pills that qualify the record: signed, audited, raising. */
  badges?: ReactNode;
  /** The one figure or date that distinguishes this row, kept to the right. */
  meta?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = children != null && children !== false;

  return (
    <div
      className={cn("rounded-lg border border-border bg-card", className)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          aria-expanded={expandable ? open : undefined}
          className={cn(
            "flex-1 min-w-0 flex items-center gap-2 text-start",
            expandable ? "cursor-pointer" : "cursor-default",
          )}
        >
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
              !expandable && "invisible",
            )}
            strokeWidth={1.5}
          />
          {index != null && (
            <span className="text-xs font-mono text-muted-foreground/60 shrink-0">
              {index}
            </span>
          )}
          <span className="text-s font-medium text-foreground truncate">
            {title}
          </span>
          {badges}
        </button>
        {meta != null && (
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
            {meta}
          </span>
        )}
        {actions}
      </div>

      {expandable && open && (
        <div className="px-3 pb-3 pt-2.5 border-t border-border/60">
          {children}
        </div>
      )}
    </div>
  );
});

/** A pill on a record's line. Colour carries the state; the words repeat it. */
export function RecordBadge({
  tone = "neutral",
  children,
}: {
  tone?: "good" | "warn" | "info" | "note" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-xs px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap shrink-0",
        tone === "good" &&
          "text-success bg-success/15 border-success/30",
        tone === "warn" && "text-orange bg-orange/15 border-orange/30",
        tone === "info" && "text-sky-400 bg-sky-500/15 border-sky-500/30",
        tone === "note" &&
          "text-violet-400 bg-violet-500/15 border-violet-500/30",
        tone === "neutral" && "text-muted-foreground bg-muted/40 border-border",
      )}
    >
      {children}
    </span>
  );
}

/** The grid a record's details are laid out on, once it's opened. */
export function RecordDetails({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2.5",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function RecordDetail({
  label,
  value,
  tone,
  span,
}: {
  label: string;
  value: ReactNode;
  tone?: "positive" | "negative";
  /** Room for prose, which doesn't fit a quarter of the row. */
  span?: boolean;
}) {
  return (
    <div className={cn("min-w-0", span && "col-span-2 md:col-span-4")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-s tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
          !tone && "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Edit and delete for a record, folded into the row's own menu. */
export function RowActions({
  label,
  onEdit,
  onDelete,
  disabled,
  compact,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          "grid shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
          compact ? "size-5" : "size-6",
        )}
      >
        <MoreVertical
          className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
          strokeWidth={1.5}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          <span className="flex-1">Edit</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          <Trash2 className="h-4 w-4" />
          <span className="flex-1">Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
