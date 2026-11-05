"use client";

import * as React from "react";

import { findNav } from "@/next-ui/shell/nav";

import { PANE_KINDS, paneTitle, viewTitle } from "./pane-registry";
import { entryFromHref, viewKey, type PaneEntry } from "./pane-url";
import { usePaneLocation } from "./use-pane-location";

const SUFFIX = " · Nizek";

/**
 * The document title follows the active pane: the side pane when one is open, otherwise the
 * main pane. "Projects · Nizek"; "Projects › <name>" becomes "<name> · Nizek", and a record's
 * view "Road map · <name> · Nizek". Renders nothing; it only writes `document.title` after the
 * route's own metadata has.
 */
export function PaneTitle() {
  const { pathname, stack, at } = usePaneLocation();
  const side = stack[at];
  const main = entryFromHref(pathname);
  const entry = side ?? main;
  const fallback = findNav(pathname)?.title ?? "Nizek";
  return entry ? <EntryTitle key={viewKey(entry)} entry={entry} /> : <SetTitle text={fallback} />;
}

function EntryTitle({ entry }: { entry: PaneEntry }) {
  const record = !!entry.id && !!PANE_KINDS[entry.kind]?.useLabel;
  if (record) return <RecordTitle entry={entry} />;
  const view = viewTitle(entry);
  return <SetTitle text={view ? `${view} · ${paneTitle(entry)}` : paneTitle(entry)} />;
}

function RecordTitle({ entry }: { entry: PaneEntry }) {
  const useLabel = PANE_KINDS[entry.kind].useLabel!;
  const label = useLabel(entry.id ?? "") ?? paneTitle(entry);
  const view = viewTitle(entry);
  return <SetTitle text={view ? `${view} · ${label}` : label} />;
}

function SetTitle({ text }: { text: string }) {
  React.useEffect(() => {
    const title = `${text}${SUFFIX}`;
    if (document.title !== title) document.title = title;
  }, [text]);
  return null;
}
