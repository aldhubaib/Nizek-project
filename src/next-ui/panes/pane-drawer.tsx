"use client";

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/next-ui/ui/drawer";

import { Pane } from "./pane";
import { paneTitle } from "./pane-registry";
import { PaneRouter } from "./pane-router";
import { usePaneStore } from "./pane-store";
import { PaneTrayItem } from "./pane-tray-item";
import { entryKey, mountKey } from "./pane-url";
import { usePaneLocation } from "./use-pane-location";

/**
 * On a phone the side pane is a bottom drawer over the main pane: 92 % tall, a swipe down
 * closes it, the tray is a row of chips at its top.
 */
export function PaneDrawer() {
  const { stack, at } = usePaneLocation();
  const store = usePaneStore.getState;
  const entry = stack[at];

  return (
    <Drawer open={!!entry} onOpenChange={(o) => !o && store().closeAll()}>
      <DrawerContent
        data-pane-drawer=""
        className="h-[92vh] bg-background p-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[92vh]"
      >
        <DrawerTitle className="sr-only">{entry ? paneTitle(entry) : "Side pane"}</DrawerTitle>
        <DrawerDescription className="sr-only">Opened over the page; swipe down to close</DrawerDescription>
        {stack.length > 1 && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {stack.map((e, i) => (
              <PaneTrayItem
                key={entryKey(e)}
                entry={e}
                index={i + 1}
                active={i === at}
                chip
                onActivate={() => store().activate(i)}
                onClose={() => store().close(i)}
              />
            ))}
          </div>
        )}
        {entry && (
          <Pane key={mountKey(entry)} side entry={entry} bare className="min-h-0 flex-1">
            <PaneRouter entry={entry} />
          </Pane>
        )}
      </DrawerContent>
    </Drawer>
  );
}
