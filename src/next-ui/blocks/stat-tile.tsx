import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { formatCompact, formatFull } from "./format"

/**
 * Label with a 16 px icon, the value large, an optional sub-line (docs/blocks-brief.md,
 * decision 8). A number is shown compact with the full value in the `title`; a string is shown
 * as it is. `tone="warning"` colours the value with the status token. With `onClick` the tile is
 * a button (hover tint, focus ring): a number the reader can act on opens what is behind it.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  title,
  onClick,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: number | string | null | undefined
  hint?: React.ReactNode
  tone?: "default" | "info" | "warning" | "success" | "destructive"
  /** A sentence for the whole tile (what the number means, what a click opens). */
  title?: string
  onClick?: () => void
  className?: string
}) {
  const text = typeof value === "number" ? formatCompact(value) : value == null || value === "" ? "—" : value
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 text-left text-card-foreground",
        onClick && "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      data-testid="stat-tile"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "truncate text-2xl font-semibold tabular-nums",
          tone === "info" && "text-info",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
        title={title ? undefined : typeof value === "number" ? formatFull(value) : undefined}
      >
        {text}
      </span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </Tag>
  )
}

/** A row of tiles that wraps by itself: five become 3 + 2, then 2 + 2 + 1, from the container's width. */
export function StatTiles({ children, min = 140, className, testId }: { children: React.ReactNode; min?: number; className?: string; testId?: string }) {
  return (
    <div
      className={cn("@container grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
      data-testid={testId ?? "stat-tiles"}
    >
      {children}
    </div>
  )
}
