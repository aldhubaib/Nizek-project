"use client"

import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { PaneContextMenu } from "@/next-ui/panes"

import { useOpen } from "./use-open"

/** As many characters of the opening as a card ever renders; its box clips well before that. */
const OPENING_CHARS = 2000

/** The first paragraphs up to `max` characters in all; the one that crosses the line is cut on a word. */
export function opening(paragraphs: readonly string[], max = OPENING_CHARS): string[] {
  const out: string[] = []
  let used = 0
  for (const p of paragraphs) {
    if (used + p.length <= max) {
      out.push(p)
      used += p.length
      continue
    }
    const room = max - used
    if (room > 20) {
      const cut = p.slice(0, room)
      const at = cut.lastIndexOf(" ")
      out.push(`${(at > room * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`)
    }
    break
  }
  return out
}

/**
 * One record whose face is its text, a card in a grid: a kind chip and a count on top, the
 * title, then the opening paragraphs in grey — as many as the card's height holds, the last
 * line fading out — and a footer line (the date, the facts). 4:5 like `RecordCardSkeleton`, so
 * a grid of them is even and a short note stands as tall as a long one. Click or Enter opens
 * the record (side pane through `href`, or the page's dialog through `onOpen`); right-click on
 * an `href` card offers Open / Open in pane / Open in new tab.
 */
export function TextCard({
  href,
  onOpen,
  kind,
  count,
  title,
  paragraphs,
  footer,
  muted,
  selected,
  className,
  testId,
}: {
  href?: string
  onOpen?: () => void
  /** What the record is, as a chip: "Meeting note", "Article". */
  kind?: React.ReactNode
  /** A small count beside the kind: "744 words". */
  count?: React.ReactNode
  title: React.ReactNode
  /** The body as blocks of plain text (`htmlToParagraphs`); the card shows what fits. */
  paragraphs?: readonly string[]
  footer?: React.ReactNode
  muted?: boolean
  selected?: boolean
  className?: string
  testId?: string
}) {
  const open = useOpen({ href, onOpen })
  const body = React.useMemo(() => opening(paragraphs ?? []), [paragraphs])
  const card = (
    <div
      tabIndex={open.enabled ? 0 : undefined}
      onClick={open.onClick}
      onKeyDown={open.onKeyDown}
      data-selected={selected || undefined}
      data-testid={testId ?? "text-card"}
      data-href={href}
      className={cn(
        "group/card flex aspect-[4/5] min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 text-card-foreground outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        open.enabled && "cursor-pointer hover:bg-muted/40",
        selected && "border-ring",
        muted && "opacity-70",
        className,
      )}
    >
      {(kind || count) && (
        <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center">{kind}</div>
          {count && <span className="shrink-0 tabular-nums">{count}</span>}
        </div>
      )}
      <div className={cn("line-clamp-3 shrink-0 text-base leading-snug font-semibold text-balance", muted && "text-muted-foreground")} dir="auto">
        {title}
      </div>
      {body.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden text-sm text-muted-foreground mask-b-from-75%" data-testid="text-card-opening">
          {body.map((p, i) => (
            <p key={i} dir="auto">
              {p}
            </p>
          ))}
        </div>
      )}
      {footer && <div className="mt-auto flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
  return href ? <PaneContextMenu href={href}>{card}</PaneContextMenu> : card
}
