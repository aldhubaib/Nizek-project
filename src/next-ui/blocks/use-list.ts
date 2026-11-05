"use client"

import * as React from "react"

import {
  EMPTY_QUERY,
  facetCounts,
  facetOptions,
  filterRows,
  isFiltered,
  sortRows,
  type FacetDef,
  type FacetOption,
  type ListQuery,
  type SortDef,
} from "./list-state"

export interface FacetState {
  def: { id: string; label: string }
  options: FacetOption[]
  counts: Map<string, number>
  selected: string[]
  onChange: (selected: string[]) => void
}

export interface ListState<T> {
  query: ListQuery
  rows: T[]
  total: number
  isFiltered: boolean
  setSearch: (s: string) => void
  setSort: (id: string | null) => void
  setFacet: (id: string, selected: string[]) => void
  reset: () => void
  facets: FacetState[]
}

/**
 * The state behind a filter bar and its collection: search text, facet selections and the sort
 * pill, applied to the page's rows in the browser. Facet counts are taken over the rows the
 * *other* filters leave, as the DataTable's faceted model did.
 */
export function useList<T>(
  rows: T[] | undefined,
  opts: {
    searchText?: (row: T) => string
    facets?: FacetDef<T>[]
    sorts?: SortDef<T>[]
    defaultSort?: string | null
    initialFacets?: Record<string, string[]>
  },
): ListState<T> {
  const { searchText, facets = [], sorts = [], defaultSort = null, initialFacets } = opts
  const [query, setQuery] = React.useState<ListQuery>({ ...EMPTY_QUERY, sort: defaultSort, facets: initialFacets ?? {} })
  const all = React.useMemo(() => rows ?? [], [rows])

  const result = React.useMemo(() => {
    const filtered = filterRows(all, query, searchText, facets)
    return sortRows(filtered, query.sort, sorts)
  }, [all, query, searchText, facets, sorts])

  const facetStates = React.useMemo<FacetState[]>(
    () =>
      facets.map((f) => {
        const others = { ...query, facets: { ...query.facets, [f.id]: [] } }
        const base = filterRows(all, others, searchText, facets)
        return {
          def: { id: f.id, label: f.label },
          options: facetOptions(all, f),
          counts: facetCounts(base, f),
          selected: query.facets[f.id] ?? [],
          onChange: (selected) => setQuery((q) => ({ ...q, facets: { ...q.facets, [f.id]: selected } })),
        }
      }),
    [all, facets, query, searchText],
  )

  return {
    query,
    rows: result,
    total: all.length,
    isFiltered: isFiltered(query),
    setSearch: (search) => setQuery((q) => ({ ...q, search })),
    setSort: (sort) => setQuery((q) => ({ ...q, sort })),
    setFacet: (id, selected) => setQuery((q) => ({ ...q, facets: { ...q.facets, [id]: selected } })),
    reset: () => setQuery((q) => ({ ...EMPTY_QUERY, sort: q.sort })),
    facets: facetStates,
  }
}
