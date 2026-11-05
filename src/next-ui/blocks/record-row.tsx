"use client"

import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { PaneContextMenu } from "@/next-ui/panes"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/next-ui/ui/item"

import { useOpen } from "./use-open"

/**
 * One record as a full-width row (docs/blocks-brief.md, decision 5), on `ui/item.tsx`. Leading:
 * an avatar, thumbnail or icon with an optional small platform badge over its corner. Content:
 * the title (one line), one description line (a measure, not the full width), then the meta
 * line of chips and facts. Leading and trailing sit in the vertical middle of the row. Trailing:
 * at most one inline control (a switch, a count) and the ⋯.
 * Click or Enter opens the record (side pane through `href`, or the page's dialog through
 * `onOpen`); right-click on an `href` row offers Open / Open in pane / Open in new tab.
 * Below `@xl` the trailing part keeps its place and the meta wraps under the text.
 */
export function RecordRow({
  href,
  onOpen,
  leading,
  badge,
  title,
  description,
  descriptionDir,
  meta,
  control,
  menu,
  muted,
  selected,
  className,
  testId,
}: {
  href?: string
  onOpen?: () => void
  leading?: React.ReactNode
  /** A small mark over the leading media's corner (a platform logo). */
  badge?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  descriptionDir?: "auto" | "ltr" | "rtl"
  meta?: React.ReactNode
  control?: React.ReactNode
  menu?: React.ReactNode
  muted?: boolean
  selected?: boolean
  className?: string
  testId?: string
}) {
  const open = useOpen({ href, onOpen })
  const row = (
    <Item
      variant="outline"
      role="listitem"
      tabIndex={open.enabled ? 0 : undefined}
      onClick={open.onClick}
      onKeyDown={open.onKeyDown}
      data-selected={selected || undefined}
      data-testid={testId ?? "record-row"}
      data-href={href}
      className={cn(
        "min-h-14 flex-nowrap items-center bg-card",
        open.enabled && "cursor-pointer hover:bg-muted/40",
        selected && "border-ring",
        muted && "opacity-70",
        className,
      )}
    >
      {leading && (
        <ItemMedia className="relative translate-y-0">
          {leading}
          {badge && (
            <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-background text-foreground ring-1 ring-border [&_svg]:size-2.5">
              {badge}
            </span>
          )}
        </ItemMedia>
      )}
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className={cn("w-full max-w-full", muted && "text-muted-foreground")}>
          <span className="min-w-0 truncate">{title}</span>
        </ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-1 w-full max-w-prose" dir={descriptionDir}>
            {description}
          </ItemDescription>
        )}
        {meta && <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>}
      </ItemContent>
      {(control || menu) && (
        <ItemActions className="shrink-0 self-center" data-no-open>
          {control}
          {menu}
        </ItemActions>
      )}
    </Item>
  )
  return href ? <PaneContextMenu href={href}>{row}</PaneContextMenu> : row
}
