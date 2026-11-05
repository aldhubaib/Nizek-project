"use client"

import * as React from "react"

import { cn } from "@/next-ui/lib/cn"

import { formatCompact, formatFull } from "./format"

export interface HeaderStat {
  icon: React.ComponentType<{ className?: string }>
  value: number | string | null | undefined
  /** The word after the number; "" for a stat whose icon says it all (a platform's held / total). */
  label: string
  title?: string
  /** Keeps stats apart when two share a label (one per platform); defaults to the label. */
  key?: string
}

/**
 * A record's top card (docs/blocks-brief.md, decision 7): avatar 64 px (48 below `@xl`), title,
 * handles, a description that clamps to three lines with "More", a wrapping stats line of
 * `icon + number + label`, a status line ("updated 2h ago · Fetch now") and the actions, which
 * sit right of the text when wide and stack under it when narrow.
 */
export function HeaderCard({
  avatar,
  title,
  badge,
  handles,
  description,
  stats,
  status,
  actions,
  className,
}: {
  avatar?: React.ReactNode
  title: React.ReactNode
  badge?: React.ReactNode
  handles?: React.ReactNode
  description?: React.ReactNode
  stats?: HeaderStat[]
  status?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const [more, setMore] = React.useState(false)
  const shown = stats?.filter((s) => s.value != null && s.value !== "")
  return (
    <section className={cn("@container rounded-xl border bg-card p-4 text-card-foreground @xl:p-5", className)} data-testid="header-card">
      <div className="flex flex-col gap-4 @xl:flex-row @xl:items-start">
        {avatar && <div className="shrink-0 [&>*]:size-12 @xl:[&>*]:size-16">{avatar}</div>}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
            <span className="min-w-0 truncate">{title}</span>
            {badge}
          </h2>
          {handles && <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">{handles}</div>}
          {description && (
            <div className="text-sm">
              <p className={cn("whitespace-pre-wrap", !more && "line-clamp-3")} data-testid="header-description">
                {description}
              </p>
              {typeof description === "string" && description.length > 180 && (
                <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setMore((v) => !v)}>
                  {more ? "Less" : "More"}
                </button>
              )}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 @xl:shrink-0 @xl:justify-end" data-testid="header-actions">{actions}</div>}
      </div>
      {shown && shown.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground" data-testid="header-stats">
          {shown.map((s) => (
            <li key={s.key ?? s.label} className="inline-flex items-center gap-1.5" title={s.title ?? (typeof s.value === "number" ? formatFull(s.value) : undefined)}>
              <s.icon className="size-4" />
              <span className="font-medium text-foreground tabular-nums">{typeof s.value === "number" ? formatCompact(s.value) : s.value}</span>
              {s.label && <span>{s.label}</span>}
            </li>
          ))}
        </ul>
      )}
      {status && <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="header-status">{status}</div>}
    </section>
  )
}
