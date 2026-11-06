"use client";

import type * as React from "react";

import { cn } from "@/next-ui/lib/cn";
import { PaneHeaderPortal } from "@/next-ui/panes/pane-header-portal";

/**
 * PageHeader, as in Social AI: the page's name for assistive technology, its actions, and an
 * optional tabs/filter row below. The pane header already shows the title (in the breadcrumb),
 * so the `<h1>` is `sr-only`; the actions go to the pane header through `PaneHeaderPortal`.
 * Actions are `HeaderAction`s (an icon each): at most one `default`, up to two secondary; the
 * rest behind "More". A header with no row below takes no space (CSS), so the content starts at
 * the top of the pane.
 */
export function PageHeader({
  title,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="page-header" className={cn("flex flex-col gap-4 pb-6", className)}>
      <h1 className="sr-only">{title}</h1>
      {actions && (
        <PaneHeaderPortal>
          <div data-slot="page-header-actions" className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        </PaneHeaderPortal>
      )}
      {children}
    </div>
  );
}
