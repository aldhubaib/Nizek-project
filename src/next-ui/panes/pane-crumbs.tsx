"use client";

import { cn } from "@/next-ui/lib/cn";
import { findNav } from "@/next-ui/shell/nav";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/next-ui/ui/breadcrumb";

import { AppLink } from "./app-link";
import { PANE_KINDS, paneSection, paneTitle, viewTitle } from "./pane-registry";
import { hrefFromEntry, parentEntry, type PaneEntry } from "./pane-url";

/**
 * The breadcrumb in a pane header: the section (with its sidebar icon) and, for a record, the
 * record's label after it; a view adds a last crumb ("Projects › Hazawy › Road map",
 * "Administrator › Teams"). A record that lives under another (a sprint's document, a task, a
 * note) shows that one first ("Projects › Hazawy › Sprint 2"). Every crumb before the last links
 * back: the section to its front page, a record to its About.
 */
export function PaneCrumbs({ side, entry, pathname }: { side: boolean; entry: PaneEntry | null; pathname: string }) {
  const section = entry ? paneSection(entry) : undefined;
  const nav = side ? undefined : findNav(pathname);
  const root = section
    ? { label: section.title, href: hrefFromEntry({ kind: section.kind }) }
    : nav
      ? { label: nav.title, href: nav.href }
      : entry
        ? { label: paneTitle(entry), href: hrefFromEntry({ kind: entry.kind }) }
        : { label: "Page", href: pathname };
  // A section carrying its own query (`/next/projects?status=late`) is still that section's icon.
  const Icon = findNav(root.href.split("?")[0])?.icon;
  const record = entry && entry.id && PANE_KINDS[entry.kind]?.useLabel ? entry : null;
  const above = record ? parentEntry(record) : undefined;
  const parent = above && PANE_KINDS[above.kind]?.useLabel ? above : null;
  const view = entry ? viewTitle(entry) : undefined;
  const rootLinks = !!record || !!view;

  return (
    <Breadcrumb aria-label={side ? "Side pane breadcrumb" : "Main pane breadcrumb"}>
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="shrink-0 whitespace-nowrap">
          {rootLinks ? (
            <BreadcrumbLink asChild>
              <AppLink href={root.href} className="inline-flex items-center gap-1.5">
                {Icon && <Icon aria-hidden className="size-4" />}
                <span className={cn(Icon && "@max-sm/header:sr-only")}>{root.label}</span>
              </AppLink>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="inline-flex items-center gap-1.5">
              {Icon && <Icon aria-hidden className="size-4" />}
              <span className={cn(Icon && "@max-sm/header:sr-only")}>{root.label}</span>
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {parent && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink asChild className="truncate" dir="auto">
                <AppLink href={hrefFromEntry(parent)}>
                  <RecordLabel key={`${parent.kind}:${parent.id}`} entry={parent} />
                </AppLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        )}
        {record && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {view ? (
                <BreadcrumbLink asChild className="truncate" dir="auto">
                  <AppLink href={hrefFromEntry({ kind: record.kind, id: record.id })}>
                    <RecordLabel key={`${record.kind}:${record.id}`} entry={record} />
                  </AppLink>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate" dir="auto">
                  <RecordLabel key={`${record.kind}:${record.id}`} entry={record} />
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}
        {view && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="shrink-0 whitespace-nowrap">
              <BreadcrumbPage>{view}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

const noMark = () => null;

/** The record's crumb (its label, or the kind's shorter name for it), and after it the kind's mark when it has one. */
function RecordLabel({ entry }: { entry: PaneEntry }) {
  const kind = PANE_KINDS[entry.kind];
  const useLabel = kind.useCrumb ?? kind.useLabel!;
  const useMark = kind.useMark ?? noMark;
  const label = useLabel(entry.id ?? "");
  const mark = useMark(entry.id ?? "");
  return (
    <>
      {label ?? "…"}
      {mark && <span className="ms-2 inline-flex align-middle">{mark}</span>}
    </>
  );
}
