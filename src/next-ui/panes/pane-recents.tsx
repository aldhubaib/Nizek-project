"use client";

import { History } from "lucide-react";

import { Button } from "@/next-ui/ui/button";

import { AppLink } from "./app-link";
import { usePaneStore } from "./pane-store";
import { useEntryText } from "./pane-tray-item";
import { entryKey, hrefFromEntry, type PaneEntry } from "./pane-url";
import { useHydrated } from "./use-hydrated";

const SHOWN = 8;

/**
 * "Recents" on the dashboard: the side entries opened lately, newest first, fed by the tray
 * history in the store. A click opens the entry in the main pane, ⌥-click beside.
 */
export function PaneRecents() {
  const recents = usePaneStore((s) => s.recents);
  // recents live in localStorage: the server renders none, so the client must do the same at first
  const hydrated = useHydrated();
  if (!hydrated || !recents.length) return null;
  return (
    <section aria-labelledby="pane-recents-title" data-pane-recents="" className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="pane-recents-title" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="size-4" />
          Recents
        </h2>
        <Button variant="ghost" size="xs" onClick={() => usePaneStore.getState().clearRecents()}>
          Clear
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {recents.slice(0, SHOWN).map((e) => (
          <li key={entryKey(e)}>
            <RecentChip entry={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentChip({ entry }: { entry: PaneEntry }) {
  const text = useEntryText(entry);
  return (
    <AppLink
      href={hrefFromEntry(entry)}
      title={`${text} · ⌥ click opens beside`}
      className="inline-flex max-w-72 items-center rounded-md border bg-card px-2.5 py-1.5 text-sm hover:bg-accent"
    >
      <span className="truncate" dir="auto">
        {text}
      </span>
    </AppLink>
  );
}
