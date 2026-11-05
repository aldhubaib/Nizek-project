"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { AppLink } from "@/next-ui/panes";
import { Button } from "@/next-ui/ui/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/next-ui/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

import { CommandPalette } from "./command-palette";

/**
 * The sidebar header, one row as in Social AI: the brand (small mark and name) on the left,
 * the ⌘K search icon on the right. The ⌘K wiring lives here: the button, the shortcut and
 * the palette.
 */
export function SidebarBrand() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="pr-0">
              <AppLink href="/next">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
                  N
                </div>
                <span className="truncate text-sm font-medium">Nizek</span>
              </AppLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search or jump to"
            className="text-muted-foreground"
            onClick={() => setOpen(true)}
          >
            <Search />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Search or jump to · ⌘K</TooltipContent>
      </Tooltip>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
