"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/next-ui/lib/cn"

import { EmptyState } from "@/next-ui/patterns/empty-state"
import { Button } from "@/next-ui/ui/button"

import { LoadMore } from "./load-more"

export type CollectionLayout = "grid" | "masonry" | "feed" | "rows"

/** The same skeleton, with its place in the wall, so a discover card can cycle its look. */
function skeletonAt(skeleton: React.ReactNode, index: number): React.ReactNode {
  if (React.isValidElement<{ index?: number }>(skeleton) && typeof skeleton.type !== "string") {
    return React.cloneElement(skeleton, { index })
  }
  return skeleton
}

/**
 * The container of cards or rows (docs/blocks-brief.md, decision 4). It is a `@container`, so
 * the blocks inside size themselves from its width, never the window's. `grid` fills columns
 * of at least `min` px; `masonry` is CSS columns of `min` px (each child avoids breaking);
 * `feed` is one column up to 640 px; `rows` is a plain stacked list. It owns the three list
 * states the DataTable had — skeletons while pending, the empty state, "No … match this filter"
 * with a way back to all of them — and the count line; `pageSize` shows long lists in slices,
 * the next slice loading as the reader scrolls to the end (`LoadMore`).
 */
export function Collection<T>({
  layout = "grid",
  min = 240,
  items,
  getKey,
  render,
  isPending,
  error,
  empty,
  isFiltered,
  onClearFilters,
  total,
  noun,
  skeleton,
  pageSize,
  skeletonCount = Math.min(pageSize ?? 6, 20),
  className,
  testId,
}: {
  layout?: CollectionLayout
  min?: number
  items: T[] | undefined
  getKey: (item: T) => string
  render: (item: T, index: number) => React.ReactNode
  isPending?: boolean
  error?: unknown
  empty: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }
  isFiltered?: boolean
  /** Puts the search and the filters back to all: the "Show all" button when nothing matches. */
  onClearFilters?: () => void
  /** Rows before filtering, for the "12 of 340" line; defaults to `items.length`. */
  total?: number
  /** The count line under the list ("3,748 posts", "12 of 3,748 posts"); left out when there is no noun. */
  noun?: string
  skeleton: React.ReactNode
  /** Skeletons while pending: the page size (capped at 20 — nobody sees the ones below the fold), else 6. */
  skeletonCount?: number
  pageSize?: number
  className?: string
  testId?: string
}) {
  // "Show more" grows the page; a new set of items (a filter, a refetch) starts it over.
  const [paging, setPaging] = React.useState<{ of: T[] | undefined; shown: number }>({ of: items, shown: pageSize ?? Infinity })
  if (paging.of !== items) setPaging({ of: items, shown: pageSize ?? Infinity })
  const shown = paging.shown
  const setShown = (f: (n: number) => number) => setPaging((p) => ({ ...p, shown: f(p.shown) }))
  const all = items ?? []
  const page = Number.isFinite(shown) ? all.slice(0, shown) : all
  const count = total ?? all.length
  const style = { "--min": `${min}px` } as React.CSSProperties
  const layoutClass =
    layout === "grid"
      ? "grid grid-cols-[repeat(auto-fill,minmax(min(var(--min),100%),1fr))] items-start gap-4"
      : layout === "masonry"
        ? "columns-[var(--min)] gap-4"
        : layout === "feed"
          ? "mx-auto flex w-full max-w-[640px] flex-col gap-4"
          : "flex flex-col gap-2"

  return (
    <div className={cn("@container flex flex-col gap-3", className)} data-testid={testId} data-layout={layout}>
      {isPending ? (
        <div className={layoutClass} style={style} aria-busy data-testid="collection-skeletons">
          {Array.from({ length: skeletonCount }).map((_, i) => {
            const node = skeletonAt(skeleton, i)
            return layout === "masonry" ? (
              <div key={i} className="mb-4 break-inside-avoid">
                {node}
              </div>
            ) : (
              <React.Fragment key={i}>{node}</React.Fragment>
            )
          })}
        </div>
      ) : error ? (
        <EmptyState icon={empty.icon} title="Could not load" description={String(error)} />
      ) : count === 0 ? (
        <EmptyState {...empty} />
      ) : all.length === 0 ? (
        <NoMatch noun={noun} onClear={onClearFilters} />
      ) : (
        <>
          {layout === "masonry" ? (
            <Masonry min={min} items={page.map((item, i) => ({ key: getKey(item), node: render(item, i) }))} />
          ) : (
            <div className={layoutClass} style={style} role={layout === "rows" ? "list" : undefined} data-testid="collection-items">
              {page.map((item, i) => (
                <React.Fragment key={getKey(item)}>{render(item, i)}</React.Fragment>
              ))}
            </div>
          )}
          {page.length < all.length && (
            <LoadMore remaining={all.length - page.length} onMore={() => setShown((n) => n + (pageSize ?? 0))}>
              Show more · {all.length - page.length} left
            </LoadMore>
          )}
        </>
      )}
      {noun && !isPending && !error && count > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums" data-testid="collection-count" data-count={all.length} data-total={count}>
          {isFiltered ? `${all.length} of ${count} ${noun}` : `${count} ${noun}`}
        </p>
      )}
    </div>
  )
}

/** What a narrowed list shows when nothing is left: the things named, and a way back to all of them. */
export function NoMatch({ noun, onClear }: { noun?: string; onClear?: () => void }) {
  const what = noun ?? "items"
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center" data-testid="collection-no-match">
      <p className="text-sm font-medium">No {what} match this filter</p>
      {onClear && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onClear}>
          Show all {what}
        </Button>
      )}
    </div>
  )
}

const GAP = 16 // gap-4, between columns and between cards
/** Cards drawn before the columns are known (the server, the first paint). The rest wait. */
const FIRST_PAINT = 12
/** Extra room above and below the screen, so the next row is ready as you arrive. */
const OVERSCAN = 480

/** A card overlaps the band of the list that is on screen (tops are from the list's top). */
export function cardInView(top: number, height: number, viewTop: number, viewBottom: number): boolean {
  return top < viewBottom && top + height > viewTop
}

/**
 * The on-screen band of the list, in the list's own coordinates. The page scrolls inside the
 * pane (`data-pane-body`), not the window. Updated as you scroll, but not on every pixel.
 */
function useVisibleBand(ref: React.RefObject<HTMLDivElement | null>, on: boolean): { top: number; bottom: number } {
  const [band, setBand] = React.useState({ top: -OVERSCAN, bottom: 900 })
  React.useEffect(() => {
    const el = ref.current
    if (!el || !on) return
    const scroller = el.closest("[data-pane-body]")
    const read = () => {
      const box = el.getBoundingClientRect()
      const view = scroller instanceof HTMLElement ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const top = view.top - box.top - OVERSCAN
      const bottom = view.bottom - box.top + OVERSCAN
      setBand((prev) => (Math.abs(prev.top - top) < 200 && Math.abs(prev.bottom - bottom) < 200 ? prev : { top, bottom }))
    }
    read()
    const target = scroller ?? window
    target.addEventListener("scroll", read, { passive: true })
    window.addEventListener("resize", read)
    return () => {
      target.removeEventListener("scroll", read)
      window.removeEventListener("resize", read)
    }
  }, [on, ref])
  return band
}

/**
 * A masonry that fills its width (20 Oct 2026): as many columns of at least `min` px as fit,
 * each card placed under the shortest column so far, in order — so the last column is as full
 * as the first, where CSS columns left it short (they balance by count, filling column by
 * column, and a page of thirteen cards in five columns ended with one card in the fifth). Until
 * the container is measured (the server, the first paint) it is CSS columns of the first screen,
 * so a long list does not draw every card at once. After that, only the cards on screen (and a
 * little above and below) are drawn; a card that has been measured keeps its height when it
 * leaves, so the scrollbar stays put. The cards stay children of the one box, positioned from
 * their measured heights, so a card that moves column keeps its state.
 */
function Masonry({ min, items }: { min: number; items: { key: string; node: React.ReactNode }[] }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [cols, setCols] = React.useState(0)
  const [heights, setHeights] = React.useState<ReadonlyMap<string, number>>(() => new Map())
  const measured = cols > 0 // the box is a different element once measured: watch it afresh
  const band = useVisibleBand(ref, measured)
  // A card not measured yet is counted as a 4:5 of the column, so the ones below the screen
  // are not all piled into the first row and drawn together.
  const fallback = Math.round(min * 1.25)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = e?.contentRect.width ?? el.clientWidth
      setCols(Math.max(1, Math.floor((w + GAP) / (min + GAP))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [min, measured])
  const cardsRo = React.useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            setHeights((prev) => {
              let next: Map<string, number> | null = null
              for (const e of entries) {
                const key = (e.target as HTMLElement).dataset.masonryKey
                const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
                if (key && prev.get(key) !== h) {
                  next ??= new Map(prev)
                  next.set(key, h)
                }
              }
              return next ?? prev
            })
          }),
    [],
  )
  React.useEffect(() => () => cardsRo?.disconnect(), [cardsRo])
  const watch = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !cardsRo) return
      cardsRo.observe(node)
      return () => cardsRo.unobserve(node)
    },
    [cardsRo],
  )

  if (cols === 0) {
    return (
      <div ref={ref} className="columns-[var(--min)] gap-4" style={{ "--min": `${min}px` } as React.CSSProperties} data-testid="collection-items">
        {items.slice(0, FIRST_PAINT).map((it) => (
          <div key={it.key} ref={watch} data-masonry-key={it.key} className="mb-4 break-inside-avoid">
            {it.node}
          </div>
        ))}
      </div>
    )
  }

  const { placed, height } = placeMasonry(
    items.map((it) => ({ key: it.key, height: heights.get(it.key) ?? fallback })),
    cols,
  )
  // one column's width, in the box's own terms: the gaps taken out, the rest shared
  const w = `calc((100% - ${(cols - 1) * GAP}px) / ${cols})`
  return (
    <div ref={ref} className="relative" style={{ height }} data-testid="collection-items" data-columns={cols}>
      {items.map((it, i) => {
        const place = placed[i]!
        const h = heights.get(it.key) ?? fallback
        if (!cardInView(place.top, h, band.top, band.bottom)) return null
        return (
          <div
            key={it.key}
            ref={watch}
            data-masonry-key={it.key}
            className="absolute"
            style={{ top: place.top, width: w, insetInlineStart: `calc(${place.column} * (${w} + ${GAP}px))` }}
          >
            {it.node}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Where each card goes: in order, under the shortest column so far (the leftmost when equal).
 * A card without a height yet takes the average of the measured ones (so the first pass, with
 * none measured, deals them round). Returns each card's column and top, and the box's height.
 */
export function placeMasonry(
  items: { key: string; height?: number }[],
  cols: number,
  gap: number = GAP,
): { placed: { key: string; column: number; top: number; measured: boolean }[]; height: number } {
  const known = items.map((it) => it.height).filter((h): h is number => h !== undefined)
  const guess = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0
  const tall = new Array<number>(Math.max(1, cols)).fill(0)
  const placed = items.map((it) => {
    let column = 0
    for (let i = 1; i < tall.length; i++) if (tall[i]! < tall[column]!) column = i
    const top = tall[column]!
    tall[column] = top + (it.height ?? guess) + gap
    return { key: it.key, column, top, measured: it.height !== undefined }
  })
  return { placed, height: Math.max(0, ...tall.map((t) => t - gap)) }
}
