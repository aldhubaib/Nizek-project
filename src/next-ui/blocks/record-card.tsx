"use client"

import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { PaneContextMenu } from "@/next-ui/panes"

import { useOpen } from "./use-open"

/**
 * One record as a card in a grid, the other face of `RecordRow`: a media box on top (a cover
 * image filling it, or an icon or avatar in its middle), then the title (one line), one or two
 * lines of description and the meta line of chips and facts. The ⋯ sits over the media's
 * corner. Click or Enter opens the record (side pane through `href`, or the page's dialog
 * through `onOpen`); right-click on an `href` card offers Open / Open in pane / Open in new tab.
 * The card is as wide as its column; the grid (`Collection` with `min`) decides how many fit.
 */
export function RecordCard({
  href,
  onOpen,
  media,
  cover,
  title,
  description,
  descriptionDir,
  meta,
  menu,
  muted,
  selected,
  className,
  testId,
}: {
  href?: string
  onOpen?: () => void
  /** What sits in the middle of the media box: an icon, an avatar. */
  media?: React.ReactNode
  /** An image that fills the media box instead. */
  cover?: string | null
  title: React.ReactNode
  description?: React.ReactNode
  descriptionDir?: "auto" | "ltr" | "rtl"
  meta?: React.ReactNode
  menu?: React.ReactNode
  muted?: boolean
  selected?: boolean
  className?: string
  testId?: string
}) {
  const open = useOpen({ href, onOpen })
  const card = (
    <div
      tabIndex={open.enabled ? 0 : undefined}
      onClick={open.onClick}
      onKeyDown={open.onKeyDown}
      data-selected={selected || undefined}
      data-testid={testId ?? "record-card"}
      data-href={href}
      className={cn(
        "group/card flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        open.enabled && "cursor-pointer hover:bg-muted/40",
        selected && "border-ring",
        muted && "opacity-70",
        className,
      )}
    >
      <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-muted/60">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          media
        )}
        {menu && (
          <div className="absolute top-1.5 right-1.5 rounded-lg bg-background/80 backdrop-blur-sm" data-no-open>
            {menu}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <div className={cn("truncate text-sm font-medium", muted && "text-muted-foreground")}>{title}</div>
        {description && (
          <div className="line-clamp-2 text-xs text-muted-foreground" dir={descriptionDir}>
            {description}
          </div>
        )}
        {meta && <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>}
      </div>
    </div>
  )
  return href ? <PaneContextMenu href={href}>{card}</PaneContextMenu> : card
}
