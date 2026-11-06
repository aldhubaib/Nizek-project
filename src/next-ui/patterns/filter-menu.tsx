"use client";

import * as React from "react";
import { ListFilter } from "lucide-react";

import { cn } from "@/next-ui/lib/cn";
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

/** The choice that narrows nothing, first in every group. */
export const ALL = "all";

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

/** One group of the menu: All, or one of its options; the groups narrow together. */
export interface FilterGroup {
  id: string;
  /** The heading over the group; the first group has none. */
  label?: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

// What each page is narrowed to right now, kept for the session (not saved): a page comes
// back the way it was left when the reader returns to it, and starts at All next time the
// app opens.
const chosen = new Map<string, Record<string, string>>();
const NONE: Record<string, string> = {};
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export interface PageFilters {
  /** The chosen value by group id; a missing group means All. */
  values: Record<string, string>;
  /** Something is chosen in at least one group. */
  active: boolean;
  set: (id: string, value: string) => void;
  clear: () => void;
  /** The chosen value of one group, All when nothing is chosen. */
  valueOf: (id: string) => string;
  /** Whether a row with this value in the group gets through: always when the group is at All. */
  passes: (id: string, value: string | null | undefined) => boolean;
}

/** The page's filter choices by group id (missing means All), with setters and a test for rows. */
export function usePageFilters(page: string): PageFilters {
  const values = React.useSyncExternalStore(
    subscribe,
    () => chosen.get(page) ?? NONE,
    () => NONE,
  );
  const set = React.useCallback(
    (id: string, value: string) => {
      const next = { ...(chosen.get(page) ?? NONE) };
      if (value === ALL) delete next[id];
      else next[id] = value;
      chosen.set(page, next);
      notify();
    },
    [page],
  );
  const clear = React.useCallback(() => {
    chosen.set(page, NONE);
    notify();
  }, [page]);
  return React.useMemo(
    () => ({
      values,
      active: Object.keys(values).length > 0,
      set,
      clear,
      valueOf: (id) => values[id] ?? ALL,
      passes: (id, value) => {
        const want = values[id];
        return want === undefined || want === (value ?? "");
      },
    }),
    [values, set, clear],
  );
}

/** One group of a `FilterMenu`, wired to the page's filters. */
export function filterGroup(filters: PageFilters, id: string, options: FilterOption[], label?: string): FilterGroup {
  return { id, label, value: filters.valueOf(id), options, onChange: (value) => filters.set(id, value) };
}

/** Options for the distinct values the rows hold, in the order given (or by label when none is). */
export function optionsOf<T>(
  rows: readonly T[] | undefined,
  value: (row: T) => string | null | undefined,
  format: (value: string) => Omit<FilterOption, "value"> = (v) => ({ label: v }),
  order?: readonly string[],
): FilterOption[] {
  const present = new Set<string>();
  for (const row of rows ?? []) {
    const v = value(row);
    if (v) present.add(v);
  }
  const values = order ? order.filter((v) => present.has(v)) : [...present];
  const options = values.map((v) => ({ value: v, ...format(v) }));
  if (!order) options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

/** The names of what is chosen, one per narrowed group, for the button and its label. */
export function chosenNames(groups: FilterGroup[]): string[] {
  return groups
    .map((group) => group.options.find((option) => option.value === group.value)?.label)
    .filter((name): name is string => !!name);
}

/**
 * The filter in a page's header: one funnel icon, a menu of groups (All or one choice each, a
 * tick on the chosen), the groups narrowing together. While anything is chosen the button fills
 * in and carries the chosen names, so a narrowed page says so at a glance; a narrow header
 * keeps the icon alone. A choice closes the menu. `what` names the things, for the labels
 * ("projects", "files").
 */
export function FilterMenu({ groups, what }: { groups: FilterGroup[]; what: string }) {
  const shown = groups.filter((group) => group.options.length > 0);
  const names = chosenNames(shown);
  const on = names.length > 0;
  const showing = on ? `Showing ${names.join(" · ")} ${what}` : `Filter ${what}`;
  if (shown.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={on ? "default" : "ghost"}
              size="sm"
              className={cn(!on && "w-7 px-0 text-muted-foreground")}
              aria-label={on ? `${showing} · change the filter` : showing}
              data-filter={on ? "on" : "off"}
              data-testid="filter-menu"
            >
              <ListFilter className="size-4" />
              {on && (
                <span className="max-w-[16rem] truncate @max-md/header:hidden" dir="auto">
                  {names.join(" · ")}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{showing}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto min-w-56" aria-label={`Filter ${what}`}>
        {shown.map((group, index) => (
          <React.Fragment key={group.id}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
            <DropdownMenuRadioGroup value={group.value} onValueChange={group.onChange} aria-label={group.label ?? `Filter ${what}`}>
              {[{ value: ALL, label: "All" } as FilterOption, ...group.options].map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value} data-group={group.id} data-value={option.value}>
                  {option.icon}
                  <span className="truncate" dir="auto">
                    {option.label}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
