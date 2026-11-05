"use client";

import { PanelRight } from "lucide-react";

import { DropdownMenuItem } from "@/next-ui/ui/dropdown-menu";

import { isPaneKind } from "./pane-registry";
import { entryFromHref } from "./pane-url";
import { usePane } from "./use-pane";

/** The "Open in pane" entry for a row's ⋯ dropdown menu; nothing when the href has no pane. */
export function OpenInPaneItem({ href }: { href: string }) {
  const pane = usePane();
  const entry = entryFromHref(href);
  if (!entry || !isPaneKind(entry.kind)) return null;
  return (
    <DropdownMenuItem onSelect={() => pane.openSide(href)}>
      <PanelRight />
      Open in pane
    </DropdownMenuItem>
  );
}
