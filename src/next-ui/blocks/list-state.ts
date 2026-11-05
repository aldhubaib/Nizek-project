/**
 * What a list does to its rows before a `Collection` shows them: search, faceted filters and the
 * sort chosen in the filter bar (docs/blocks-brief.md, decision 6). Pure functions over plain
 * arrays — the same work the DataTable's row model did, without a table.
 */

export interface FacetOption {
  value: string
  label: string
}

/** One "+ Label" filter chip: the row's value(s) for it, and how a raw value is labelled. */
export interface FacetDef<T> {
  id: string
  label: string
  value: (row: T) => string | string[] | null | undefined
  format?: (value: string) => string
  /** A fixed option list; when omitted the distinct values in the data are offered. */
  options?: FacetOption[]
}

/** One sort pill: a comparator over two rows. `byText`, `byNumber`, `byDate` build the usual ones. */
export interface SortDef<T> {
  id: string
  label: string
  compare: (a: T, b: T) => number
}

export interface ListQuery {
  search: string
  facets: Record<string, string[]>
  sort: string | null
}

export const EMPTY_QUERY: ListQuery = { search: "", facets: {}, sort: null }

const norm = (s: string) => s.trim().toLowerCase()

function values<T>(facet: FacetDef<T>, row: T): string[] {
  const v = facet.value(row)
  if (v == null) return []
  return Array.isArray(v) ? v.filter((x) => x !== "") : v === "" ? [] : [v]
}

/** Rows that match the search text and every active facet (a facet matches when any of its values is selected). */
export function filterRows<T>(rows: T[], q: ListQuery, searchText?: (row: T) => string, facets: FacetDef<T>[] = []): T[] {
  const needle = norm(q.search)
  const active = facets.filter((f) => (q.facets[f.id] ?? []).length > 0)
  if (!needle && active.length === 0) return rows
  return rows.filter((row) => {
    if (needle && searchText && !norm(searchText(row)).includes(needle)) return false
    for (const f of active) {
      const selected = q.facets[f.id] ?? []
      if (!values(f, row).some((v) => selected.includes(v))) return false
    }
    return true
  })
}

/** Rows in the chosen sort's order; without a chosen sort, the rows as given. */
export function sortRows<T>(rows: T[], sortId: string | null, sorts: SortDef<T>[] = []): T[] {
  const s = sorts.find((x) => x.id === sortId)
  if (!s) return rows
  return [...rows].sort(s.compare)
}

/** How many rows carry each facet value, counted over `rows` (the rows the other filters left). */
export function facetCounts<T>(rows: T[], facet: FacetDef<T>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) for (const v of values(facet, row)) counts.set(v, (counts.get(v) ?? 0) + 1)
  return counts
}

/** The chip's options: the fixed list, or the distinct values labelled and sorted. */
export function facetOptions<T>(rows: T[], facet: FacetDef<T>): FacetOption[] {
  if (facet.options) return facet.options
  const seen = new Set<string>()
  for (const row of rows) for (const v of values(facet, row)) seen.add(v)
  return [...seen]
    .map((value) => ({ value, label: facet.format ? facet.format(value) : value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export const isFiltered = (q: ListQuery) => norm(q.search).length > 0 || Object.values(q.facets).some((v) => v.length > 0)

// ---- comparators: undefined / null / "" sort last whatever the direction ----

function withUndefinedLast<T, V>(key: (row: T) => V | null | undefined, cmp: (a: V, b: V) => number, desc: boolean) {
  return (a: T, b: T) => {
    const va = key(a)
    const vb = key(b)
    const ea = va == null || va === ""
    const eb = vb == null || vb === ""
    if (ea && eb) return 0
    if (ea) return 1
    if (eb) return -1
    const r = cmp(va as V, vb as V)
    return desc ? -r : r
  }
}

export const byText = <T>(key: (row: T) => string | null | undefined, desc = false) =>
  withUndefinedLast(key, (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }), desc)

export const byNumber = <T>(key: (row: T) => number | null | undefined, desc = true) =>
  withUndefinedLast(key, (a: number, b: number) => a - b, desc)

export const byDate = <T>(key: (row: T) => string | null | undefined, desc = true) =>
  withUndefinedLast(key, (a: string, b: string) => Date.parse(a) - Date.parse(b), desc)
