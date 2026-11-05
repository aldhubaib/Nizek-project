"use client";

import { PanelLeftOpen } from "lucide-react";

import { Button } from "@/next-ui/ui/button";
import { useSidebar } from "@/next-ui/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * The sidebar slides away instead of shrinking to icons, so a round button in the bottom-left
 * corner brings it back while it is hidden.
 */
export function PaneSidebarRestore() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  if (isMobile || state !== "collapsed") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Show sidebar"
          data-pane-sidebar-restore=""
          onClick={toggleSidebar}
          className="fixed bottom-5 left-5 z-40 rounded-full bg-background/80 text-muted-foreground shadow-md backdrop-blur"
        >
          <PanelLeftOpen />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Show sidebar · ⌘B</TooltipContent>
    </Tooltip>
  );
}
