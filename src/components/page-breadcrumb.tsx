"use client";

import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
};

/**
 * Crumbs shown either side of the ellipsis when a trail is collapsed: the first,
 * so there is always a way back to the top, and the last two, so the current
 * page keeps the parent that gives it meaning ("… / Acme redesign / New task"
 * rather than a bare "New task").
 *
 * A trail is only collapsed once it is longer than these, so four levels is the
 * shallowest trail that ever shows an ellipsis — collapsing three would hide one
 * crumb behind a control the same width, and gain nothing.
 */
const LEADING = 1;
const TRAILING = 2;

function Crumb({
  item,
  current,
}: {
  item: BreadcrumbItem;
  current: boolean;
}) {
  const className = cn(
    "page-name min-w-0 truncate",
    current ? "text-foreground" : "text-muted-foreground",
    item.className,
  );

  if (current) {
    return (
      <span className={className} aria-current="page">
        {item.label}
      </span>
    );
  }

  if (item.href) {
    return (
      <Link href={item.href} className={cn(className, "hover:text-foreground")}>
        {item.label}
      </Link>
    );
  }

  if (item.onClick) {
    function onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.onClick?.();
      }
    }
    return (
      <span
        role="link"
        tabIndex={0}
        onClick={item.onClick}
        onKeyDown={onKeyDown}
        className={cn(className, "cursor-pointer hover:text-foreground")}
      >
        {item.label}
      </span>
    );
  }

  return <span className={className}>{item.label}</span>;
}

function Separator() {
  return (
    <span className="page-name shrink-0 text-muted-foreground/40" aria-hidden>
      /
    </span>
  );
}

/**
 * The hidden middle of a collapsed trail, behind a ⋯ that opens on click.
 *
 * Every crumb in here is a step someone might want to jump back to, so each one
 * stays actionable. A middle crumb with neither an href nor an onClick is still
 * listed, disabled — dropping it would make the trail lie about its depth.
 */
function CollapsedCrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Show ${items.length} hidden ${items.length === 1 ? "level" : "levels"}`}
        className="page-name shrink-0 rounded px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        …
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-64">
        {items.map((item, i) => {
          const label = <span className="flex-1 truncate">{item.label}</span>;

          if (item.href) {
            return (
              <DropdownMenuItem key={i} render={<Link href={item.href} />}>
                {label}
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem
              key={i}
              disabled={!item.onClick}
              onClick={item.onClick}
            >
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The trail of pages above this one, collapsing its middle when it gets deep.
 *
 * Deep trails are the reason this collapses rather than scrolls or wraps: the
 * header is a single fixed-height row shared with the page's buttons, so a long
 * trail either squeezed every crumb down to a few truncated characters or pushed
 * the current page out of sight. The first and last crumbs answer "where am I,
 * and how do I get out"; the rest are one click away and cost no width.
 */
export function PageBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  const collapsed = items.length > LEADING + TRAILING + 1;

  // Rendered as a flat list of nodes so the separators between the visible
  // crumbs and the ellipsis follow the same rule as the ones between crumbs.
  const shown: ReactNode[] = collapsed
    ? [
        ...items.slice(0, LEADING).map((item, i) => (
          <Crumb key={`lead-${i}`} item={item} current={false} />
        )),
        <CollapsedCrumbs
          key="collapsed"
          items={items.slice(LEADING, items.length - TRAILING)}
        />,
        ...items.slice(items.length - TRAILING).map((item, i, arr) => (
          <Crumb key={`tail-${i}`} item={item} current={i === arr.length - 1} />
        )),
      ]
    : items.map((item, i) => (
        <Crumb key={i} item={item} current={i === items.length - 1} />
      ));

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {shown.map((node, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator />}
          {node}
        </Fragment>
      ))}
    </nav>
  );
}
