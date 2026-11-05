import { describe, expect, it } from "vitest"

import { byDate, byNumber, byText, facetCounts, facetOptions, filterRows, isFiltered, sortRows, type FacetDef } from "@/next-ui/blocks/list-state"

interface Row {
  id: string
  name: string
  platform: string
  views?: number
  at?: string
  tags: string[]
}

const rows: Row[] = [
  { id: "a", name: "alpha", platform: "x", views: 10, at: "2026-01-03T00:00:00Z", tags: ["t1"] },
  { id: "b", name: "Bravo", platform: "instagram", views: 300, at: "2026-01-01T00:00:00Z", tags: ["t1", "t2"] },
  { id: "c", name: "charlie", platform: "instagram", tags: [] },
]

const platform: FacetDef<Row> = { id: "platform", label: "Channel", value: (r) => r.platform, format: (v) => v.toUpperCase() }
const tags: FacetDef<Row> = { id: "tags", label: "Tag", value: (r) => r.tags }

describe("the list state", () => {
  it("searches the text and applies every facet", () => {
    const q = { search: "", facets: {}, sort: null }
    expect(filterRows(rows, { ...q, search: "ALP" }, (r) => r.name).map((r) => r.id)).toEqual(["a"])
    expect(filterRows(rows, { ...q, facets: { platform: ["instagram"] } }, undefined, [platform]).map((r) => r.id)).toEqual(["b", "c"])
    expect(filterRows(rows, { ...q, facets: { tags: ["t2"] } }, undefined, [tags]).map((r) => r.id)).toEqual(["b"])
    expect(filterRows(rows, { ...q, search: "a", facets: { platform: ["x"] } }, (r) => r.name, [platform]).map((r) => r.id)).toEqual(["a"])
    expect(isFiltered(q)).toBe(false)
    expect(isFiltered({ ...q, facets: { platform: ["x"] } })).toBe(true)
  })

  it("offers the distinct values labelled, with counts", () => {
    expect(facetOptions(rows, platform)).toEqual([
      { value: "instagram", label: "INSTAGRAM" },
      { value: "x", label: "X" },
    ])
    expect([...facetCounts(rows, tags).entries()]).toEqual([
      ["t1", 2],
      ["t2", 1],
    ])
  })

  it("sorts by text, number and date with the empty ones last", () => {
    const sorts = [
      { id: "name", label: "Name", compare: byText<Row>((r) => r.name) },
      { id: "views", label: "Top viewed", compare: byNumber<Row>((r) => r.views) },
      { id: "recent", label: "Recent", compare: byDate<Row>((r) => r.at) },
    ]
    expect(sortRows(rows, "name", sorts).map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(sortRows(rows, "views", sorts).map((r) => r.id)).toEqual(["b", "a", "c"])
    expect(sortRows(rows, "recent", sorts).map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(sortRows(rows, null, sorts)).toBe(rows)
  })
})
