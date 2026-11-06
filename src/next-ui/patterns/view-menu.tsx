"use client";

import * as React from "react";
import { LayoutGrid, Rows3 } from "lucide-react";

import type { Pill } from "@/next-ui/blocks/pill-group";
import { Button } from "@/next-ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/next-ui/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * How wide a card is at least, per size level: the grid fits as many columns of that width as
 * the pane allows, so it stays responsive — a narrow pane still gets one full-width card, a
 * wide screen more columns at the same size. Level 2 is the usual.
 */
export const CARD_SIZES = [160, 200, 240, 300, 380] as const;
export const DEFAULT_CARD_LEVEL = 2;
export const SIZE_NAMES = ["Smallest", "Small", "Medium", "Large", "Largest"] as const;

/** Cards in a grid, or one full-width row per item. */
export type ViewLayout = "cards" | "rows";

export interface PageView {
  layout: ViewLayout;
  level: number;
}

const DEFAULTS: Record<ViewLayout, PageView> = {
  rows: { layout: "rows", level: DEFAULT_CARD_LEVEL },
  cards: { layout: "cards", level: DEFAULT_CARD_LEVEL },
};

const isLevel = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < CARD_SIZES.length;
const isLayout = (value: unknown): value is ViewLayout => value === "cards" || value === "rows";

// One saved view per page (`projects`, `assets`), kept in localStorage so it is the same next
// time, on every project. The store hands out one object per page until it changes, as
// useSyncExternalStore wants.
const views = new Map<string, PageView>();
const listeners = new Set<() => void>();

export function viewStorageKey(page: string): string {
  return `next-ui.view.${page}`;
}

function readView(page: string, fallback: PageView): PageView {
  const cached = views.get(page);
  if (cached) return cached;
  let view = fallback;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(viewStorageKey(page)) ?? "null");
    if (raw && typeof raw === "object") {
      const { layout, level } = raw as Partial<PageView>;
      view = { layout: isLayout(layout) ? layout : fallback.layout, level: isLevel(level) ? level : fallback.level };
    }
  } catch {
    // nothing saved, or not ours: the usual view
  }
  views.set(page, view);
  return view;
}

function writeView(page: string, view: PageView) {
  views.set(page, view);
  try {
    window.localStorage.setItem(viewStorageKey(page), JSON.stringify(view));
  } catch {
    // private mode, full storage: the choice holds for this page load only
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface PageViewState extends PageView {
  /** The least card width for the level, for `Collection`'s `min`. */
  min: number;
  cards: boolean;
  setLayout: (layout: ViewLayout) => void;
  setLevel: (level: number) => void;
}

/**
 * The page's view: cards or rows, and the card size level (0–4) with the matching least column
 * width. The server and the first paint use the page's usual view (the saved one would not
 * match the server's HTML); the saved view takes over once hydrated.
 */
export function usePageView(page: string, defaultLayout: ViewLayout = "rows"): PageViewState {
  const fallback = DEFAULTS[defaultLayout];
  const view = React.useSyncExternalStore(
    subscribe,
    () => readView(page, fallback),
    () => fallback,
  );
  const setLayout = React.useCallback((layout: ViewLayout) => writeView(page, { ...readView(page, fallback), layout }), [page, fallback]);
  const setLevel = React.useCallback(
    (level: number) =>
      writeView(page, { layout: "cards", level: Math.max(0, Math.min(CARD_SIZES.length - 1, Math.round(level))) }),
    [page],
  );
  return React.useMemo(
    () => ({ ...view, min: CARD_SIZES[view.level] ?? CARD_SIZES[DEFAULT_CARD_LEVEL], cards: view.layout === "cards", setLayout, setLevel }),
    [view, setLayout, setLevel],
  );
}

/**
 * The view in a page's header, one button: it shows the layout in use (the cards icon or the
 * rows icon) and opens a menu of what the page can look like. First the layout, Cards or Rows;
 * under it the card size, Smallest to Largest (as many per row as fit; a size picks the cards
 * too, so one click gets there from the rows); then, when the page sorts, what it is sorted
 * by. The chosen ones carry a tick; a choice closes the menu, and the view is saved for next
 * time (`usePageView`).
 */
export function ViewMenu({
  view,
  sorts,
  sort,
  onSort,
}: {
  view?: PageViewState;
  sorts?: Pill[];
  sort?: string;
  onSort?: (id: string) => void;
}) {
  const cards = view?.layout === "cards";
  const size = SIZE_NAMES[view?.level ?? DEFAULT_CARD_LEVEL] ?? SIZE_NAMES[DEFAULT_CARD_LEVEL];
  const sorting = sorts && sorts.length > 0 && onSort ? sorts : null;
  const sortName = sorting?.find((s) => s.id === sort)?.label;
  const look = view ? (cards ? `Cards, ${size.toLowerCase()}` : "Rows") : null;
  const label = ["View:", look, sortName && `by ${sortName.toLowerCase()}`].filter(Boolean).join(" ");
  if (!view && !sorting) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={label}
              data-layout={view?.layout}
              data-level={view?.level}
              data-testid="view-menu"
            >
              {cards ? <LayoutGrid /> : <Rows3 />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto min-w-56" aria-label="View">
        {view && (
          <>
            <DropdownMenuRadioGroup value={view.layout} onValueChange={(v) => view.setLayout(v as ViewLayout)} aria-label="Layout">
              <DropdownMenuRadioItem value="cards" data-layout="cards">
                <LayoutGrid />
                Cards
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="rows" data-layout="rows">
                <Rows3 />
                Rows
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Card size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={cards ? String(view.level) : ""} onValueChange={(v) => view.setLevel(Number(v))} aria-label="Card size">
              {SIZE_NAMES.map((name, level) => (
                <DropdownMenuRadioItem key={name} value={String(level)} data-level={level}>
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {sorting && (
          <>
            {view && <DropdownMenuSeparator />}
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort ?? sorting[0].id} onValueChange={onSort} aria-label="Sort by">
              {sorting.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id} data-sort={s.id}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
