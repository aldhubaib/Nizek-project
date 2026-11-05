"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/next-ui/ui/sheet";

import { Pane } from "./pane";
import { paneTitle } from "./pane-registry";
import { PaneRouter } from "./pane-router";
import { usePaneStore } from "./pane-store";
import { mountKey, type PaneEntry } from "./pane-url";

/**
 * Below 1024 px the side pane covers the main one as an overlay from the right: same header,
 * same URL. Closing the sheet closes the pane.
 */
export function PaneSheet({ entry }: { entry: PaneEntry | undefined }) {
  const store = usePaneStore.getState;
  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && store().close()}>
      <SheetContent side="right" showCloseButton={false} className="w-[min(100vw-2rem,560px)] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{entry ? paneTitle(entry) : "Side pane"}</SheetTitle>
        <SheetDescription className="sr-only">Opened beside the page</SheetDescription>
        {entry && (
          <Pane key={mountKey(entry)} side entry={entry} bare className="h-full">
            <PaneRouter entry={entry} />
          </Pane>
        )}
      </SheetContent>
    </Sheet>
  );
}
