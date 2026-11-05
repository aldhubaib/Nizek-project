import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

/**
 * The in-page block title (docs/blocks-brief.md, decision 10): 16 px semibold on the left, a
 * muted scope ("Last 30 days") or a `link`-variant action ("View recents →") on the right.
 */
export function SectionHeader({
  title,
  description,
  meta,
  action,
  as: Tag = "h2",
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  as?: "h2" | "h3" | "h4"
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-1", className)} data-testid="section-header">
      <div className="min-w-0">
        <Tag className="text-base font-semibold leading-tight">{title}</Tag>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {(meta || action) && (
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {meta}
          {action}
        </div>
      )}
    </div>
  )
}
