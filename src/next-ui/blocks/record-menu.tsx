"use client"

import * as React from "react"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/next-ui/lib/cn"

import { OpenInPaneItem } from "@/next-ui/panes"
import { Button } from "@/next-ui/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/next-ui/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip"

/**
 * The ⋯ of a card or row (ui-system §4.2): a `ghost` `icon-sm` button with a tooltip, opening
 * a menu of the page's items. With an `href`, "Open in pane" leads the menu
 * (`open-in-pane-item.tsx`). Clicks never reach the record.
 */
export function RecordMenu({
  href,
  label = "Actions",
  children,
  className,
  contentClassName,
}: {
  href?: string
  label?: string
  /** The page's own items, after "Open in pane"; a menu may hold that alone. */
  children?: React.ReactNode
  className?: string
  /** The menu's own classes — a wider menu (`min-w-48`) when an item's words need it; the menu is as wide as its ⋯ by default. */
  contentClassName?: string
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label} className={cn("shrink-0", className)} data-testid="record-menu" data-no-open>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className={contentClassName}
        onClick={(e) => e.stopPropagation()}
        // an item that opened a popover (Save to collection…) keeps the focus there: returning it
        // to the ⋯ would open its tooltip over the popover and take the first Escape
        onCloseAutoFocus={(e) => {
          if (document.activeElement?.closest("[data-slot=popover-content]")) e.preventDefault()
        }}
      >
        {href && <OpenInPaneItem href={href} />}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
