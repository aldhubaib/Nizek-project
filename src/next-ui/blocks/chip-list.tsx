import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { Badge } from "@/next-ui/ui/badge"

/**
 * Wrapping chips and small facts under a title (docs/blocks-brief.md, decision 5): platform,
 * label, mention… Each child is one chip or one muted fact; `Chip` is the plain one.
 * Facts separate with a middle dot so a narrow row still reads as one line of meta.
 */
export function ChipList({ children, className, dense }: { children: React.ReactNode; className?: string; dense?: boolean }) {
  const items = React.Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground", dense && "gap-x-1", className)} data-slot="chip-list">
      {items}
    </div>
  )
}

/** One chip: a `Badge` with `outline` by default; a `title` carries the full text when it truncates. */
export function Chip({
  children,
  variant = "outline",
  title,
  className,
}: {
  children: React.ReactNode
  variant?: "outline" | "secondary" | "default"
  title?: string
  className?: string
}) {
  return (
    <Badge variant={variant} title={title} className={cn("max-w-full truncate font-normal", className)}>
      {children}
    </Badge>
  )
}

/**
 * One muted fact ("Units 120", "2d"), with an optional label in front; `title` holds the full
 * value. A small icon before the value sits on its line (an svg is a block on its own otherwise).
 */
export function Fact({ label, children, title, className }: { label?: string; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap tabular-nums", className)} title={title}>
      {label && <span className="text-muted-foreground/80">{label}</span>}
      <span className="inline-flex items-center gap-1 text-foreground/90">{children}</span>
    </span>
  )
}
