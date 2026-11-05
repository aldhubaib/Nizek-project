"use client"

import * as React from "react"
import { X } from "lucide-react"

import { PillGroup, type Pill } from "@/next-ui/blocks/pill-group"
import type { FacetState } from "@/next-ui/blocks/use-list"
import { PaneHeaderPortal, PaneHeaderSearch } from "@/next-ui/panes"
import { Button } from "@/next-ui/ui/button"

import { FacetedFilter } from "./faceted-filter"

/**
 * The bar above a collection (docs/blocks-brief.md, decision 6), left to right: the search (an
 * icon in the pane header, see `PaneHeaderSearch`), an optional range
 * control, the sort pills, the type pills, the dashed "+ Label" facet chips, Reset when anything
 * is active, then `trailing` on the right. Everything wraps; nothing scrolls sideways. Sorting
 * lives here, never in column headers. The bar is a sibling of the collection, never a child of
 * `PageHeader`: it brings its own 24 px gap below.
 */
export function FilterBar({
  search,
  onSearch,
  placeholder = "Search…",
  range,
  sorts,
  sort,
  onSort,
  types,
  type,
  onType,
  typeLabel = "Type",
  facets,
  isFiltered,
  onReset,
  children,
  trailing,
  action,
}: {
  search?: string
  onSearch?: (v: string) => void
  placeholder?: string
  range?: React.ReactNode
  sorts?: Pill[]
  sort?: string
  onSort?: (id: string) => void
  types?: Pill[]
  type?: string
  onType?: (id: string) => void
  typeLabel?: string
  facets?: FacetState[]
  isFiltered?: boolean
  onReset?: () => void
  children?: React.ReactNode
  trailing?: React.ReactNode
  /** The page's primary action(s): they move to the pane header. */
  action?: React.ReactNode
}) {
  // 24 px below the bar, the same as the pane's padding above it: header · gap · filter · gap · content
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 empty:hidden" data-testid="filter-bar">
      {onSearch && (
        <PaneHeaderPortal pin>
          <PaneHeaderSearch value={search ?? ""} onChange={onSearch} placeholder={placeholder} />
        </PaneHeaderPortal>
      )}
      {range}
      {sorts && sorts.length > 0 && onSort && <PillGroup label="Sort" pills={sorts} value={sort ?? sorts[0].id} onChange={onSort} />}
      {types && types.length > 0 && onType && (
        <PillGroup label={typeLabel} showLabel pills={types} value={type ?? types[0].id} onChange={onType} />
      )}
      {facets?.map((f) => (
        <FacetedFilter key={f.def.id} label={f.def.label} options={f.options} counts={f.counts} selected={f.selected} onChange={f.onChange} />
      ))}
      {children}
      {isFiltered && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
          <X />
        </Button>
      )}
      {(trailing || action) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {trailing}
          {action && <PaneHeaderPortal>{action}</PaneHeaderPortal>}
        </div>
      )}
    </div>
  )
}
