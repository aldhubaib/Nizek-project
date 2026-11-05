"use client";

import type * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, PanelRight, X } from "lucide-react";

import { useProjectBrief } from "@/next-ui/data/projects";
import { useIsAdmin } from "@/next-ui/lib/viewer";
import { usePane } from "@/next-ui/panes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/next-ui/ui/command";

import { ADMIN_ITEM, ADMIN_NAV, NAV, projectIdOf, projectNavHref, visibleProjectNav, type NavGroup } from "./nav";

/**
 * ⌘K: jump to any section (Enter → main pane, ⌥↵ → beside), the open project's views, for
 * admins the Administrator menu's pages, and pane commands.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pane = usePane();
  const projectId = projectIdOf(usePathname());
  const isAdmin = useIsAdmin();
  const groups: NavGroup[] = isAdmin
    ? [...NAV, ...ADMIN_NAV.map((g) => ({ ...g, label: `${ADMIN_ITEM.title} · ${g.label}` }))]
    : NAV;
  const go = (href: string) => {
    onOpenChange(false);
    pane.navigate(href);
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  // ⌥↵ opens the highlighted destination beside; items carry their href for it
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !e.altKey) return;
    // the highlighted result — or, a beat after typing when cmdk has not re-selected yet, the first match
    const list = e.currentTarget;
    const href = (
      list.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]') ??
      list.querySelector<HTMLElement>("[cmdk-item]:not([aria-disabled=true])")
    )?.dataset.href;
    if (!href) return;
    e.preventDefault();
    e.stopPropagation(); // keep cmdk's own Enter (main pane) from firing too
    run(() => pane.openSide(href));
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search or jump to a section">
      <div onKeyDown={onKeyDown}>
        <CommandInput placeholder="Search or jump to…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {projectId && <ProjectGroup projectId={projectId} go={go} />}
          {groups.map((g) => (
            <CommandGroup key={g.label ?? g.items[0]?.href} heading={g.label}>
              {g.items.map((i) => (
                <CommandItem key={i.href} data-href={i.href} onSelect={() => go(i.href)}>
                  <i.icon />
                  {i.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Panes">
            <CommandItem onSelect={() => run(() => pane.close())}>
              <X />
              Close pane
              <CommandShortcut>⌥W</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => pane.swap())}>
              <ArrowLeftRight />
              Swap panes
              <CommandShortcut>⌥⇧S</CommandShortcut>
            </CommandItem>
            <CommandItem disabled>
              <PanelRight />
              Open beside: ⌥↵ here, ⌥-click a link · switch panes: ⌥1–⌥8
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}

/** The open project's views, first in the list while a project is open. */
function ProjectGroup({ projectId, go }: { projectId: string; go: (href: string) => void }) {
  const brief = useProjectBrief(projectId);
  return (
    <CommandGroup heading={brief?.name ?? "Project"}>
      {visibleProjectNav(brief?.sprintsEnabled ?? true).map((item) => {
        const href = projectNavHref(projectId, item);
        return (
          <CommandItem key={href} value={`${brief?.name ?? "Project"} ${item.title}`} data-href={href} onSelect={() => go(href)}>
            <item.icon />
            {item.title}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
