"use client"

import { cn } from "@/next-ui/lib/cn"

import { ToggleGroup, ToggleGroupItem } from "@/next-ui/ui/toggle-group"

export interface Pill {
  id: string
  label: string
}

/**
 * A single-select group of round pills that wraps (docs/blocks-brief.md, decision 6): the sort
 * ("Recent", "Top viewed") or the type ("All", "Reels") of a filter bar. One pill is always
 * pressed; clicking the pressed one keeps it. `label` names the group for assistive tech and
 * can be shown in front of the pills ("Type").
 */
export function PillGroup({
  label,
  showLabel,
  pills,
  value,
  onChange,
  className,
}: {
  label: string
  showLabel?: boolean
  pills: Pill[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1 rounded-full bg-muted/40 p-1", className)} data-testid={`pills-${label}`}>
      {showLabel && <span className="px-2 text-xs text-muted-foreground">{label}</span>}
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v)}
        aria-label={label}
        spacing={1}
        className="flex-wrap"
      >
        {pills.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            size="sm"
            className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
