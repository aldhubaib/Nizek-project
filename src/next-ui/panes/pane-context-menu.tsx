"use client";

import type * as React from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/next-ui/ui/context-menu";

import { isPaneKind } from "./pane-registry";
import { entryFromHref } from "./pane-url";
import { usePane } from "./use-pane";

/**
 * Right-click menu for anything that leads to a record or section: Open, Open in pane, Open in
 * new tab. Only when the href has a pane; otherwise the children render exactly as they are.
 */
export function PaneContextMenu({ href, children }: { href?: string; children: React.ReactElement }) {
  const entry = href ? entryFromHref(href) : null;
  if (!href || !entry || !isPaneKind(entry.kind)) return children;
  return <PaneContextMenuInner href={href}>{children}</PaneContextMenuInner>;
}

function PaneContextMenuInner({ href, children }: { href: string; children: React.ReactElement }) {
  const pane = usePane();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => pane.navigate(href)}>Open</ContextMenuItem>
        <ContextMenuItem onSelect={() => pane.openSide(href)}>
          Open in pane
          <ContextMenuShortcut>⌥ click</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => window.open(href, "_blank")}>
          Open in new tab
          <ContextMenuShortcut>⌘ click</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
