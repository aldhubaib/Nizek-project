"use client";

import * as React from "react";

import { cn } from "@/next-ui/lib/cn";
import { Button } from "@/next-ui/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * A page's action in the pane header: an icon only, like the search, Filter and View buttons
 * beside it, with its name in a tooltip and for assistive technology. Every action in a pane
 * header goes through this, so the header reads the same on every page. When the header is too
 * narrow and the action moves into the More menu, the name shows next to the icon there.
 */
export function HeaderAction({
  label,
  icon,
  variant = "default",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size" | "asChild"> & {
  /** What it does, in two or three words ("Add people"); the tooltip and the accessible name. */
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="icon-sm"
          data-pane-header-action=""
          className={cn(
            "in-data-[pane-header-overflow]:w-auto in-data-[pane-header-overflow]:gap-1.5 in-data-[pane-header-overflow]:px-2.5 in-data-[pane-header-overflow]:text-[0.8rem]",
            className,
          )}
          {...props}
        >
          {icon}
          <span className="sr-only in-data-[pane-header-overflow]:not-sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
