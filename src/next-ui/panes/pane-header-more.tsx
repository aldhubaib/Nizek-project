"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";

import { Button } from "@/next-ui/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/next-ui/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * The "More" button of a pane header: shown when the page's actions do not fit beside the
 * breadcrumb. Its popover is the slot `PaneHeaderPortal` renders them into, stacked.
 */
export function PaneHeaderMore({ slotRef }: { slotRef: React.Ref<HTMLDivElement> }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions" data-pane-header-more="">
              <Ellipsis />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto min-w-48 p-1.5">
        <div
          ref={slotRef}
          data-pane-header-overflow=""
          className="flex flex-col gap-1 [&_[data-slot=page-header-actions]]:flex-col [&_[data-slot=page-header-actions]]:items-stretch [&_button]:justify-start"
        />
      </PopoverContent>
    </Popover>
  );
}
