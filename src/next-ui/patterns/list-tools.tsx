"use client";

import * as React from "react";

import type { Pill } from "@/next-ui/blocks/pill-group";
import { PaneHeaderPortal, PaneHeaderSearch } from "@/next-ui/panes";

import { FilterMenu, type FilterGroup } from "./filter-menu";
import { ViewMenu, type PageViewState } from "./view-menu";

/**
 * The tools of a page that shows data, all in the header of its pane, left to right: the
 * search (an icon until it is used), the Filter menu (what is shown), the View menu (how it is
 * shown and in what order), then the page's primary action. Every list in the new UI gets the
 * same three, so a reader finds them in the same place on every page. The search, filter and
 * view stay in the header however narrow it is; the action moves to the More menu when it does
 * not fit. Renders nothing in the body.
 */
export function ListTools({
  what,
  search,
  onSearch,
  placeholder,
  groups,
  view,
  sorts,
  sort,
  onSort,
  action,
}: {
  /** The things listed, for labels ("projects", "files"). */
  what: string;
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  /** The Filter menu's groups; groups without options are left out, and no groups means no button. */
  groups?: FilterGroup[];
  /** The page's view (`usePageView`); left out on a page that only sorts. */
  view?: PageViewState;
  sorts?: Pill[];
  sort?: string;
  onSort?: (id: string) => void;
  /** The page's primary action(s): `HeaderAction`s, an icon each like the tools beside them. */
  action?: React.ReactNode;
}) {
  return (
    <>
      {onSearch && (
        <PaneHeaderPortal pin>
          <PaneHeaderSearch value={search ?? ""} onChange={onSearch} placeholder={placeholder ?? `Search ${what}…`} />
        </PaneHeaderPortal>
      )}
      {groups && groups.length > 0 && (
        <PaneHeaderPortal pin>
          <FilterMenu groups={groups} what={what} />
        </PaneHeaderPortal>
      )}
      {(view || (sorts && onSort)) && (
        <PaneHeaderPortal pin>
          <ViewMenu view={view} sorts={sorts} sort={sort} onSort={onSort} />
        </PaneHeaderPortal>
      )}
      {action && <PaneHeaderPortal>{action}</PaneHeaderPortal>}
    </>
  );
}
