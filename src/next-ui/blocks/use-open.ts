"use client"

import * as React from "react"

import { usePane } from "@/next-ui/panes"

/** Things inside a card or row that take the click themselves; the record does not open from them. */
export const INTERACTIVE = "a,button,input,select,textarea,label,[role='menuitem'],[role='checkbox'],[role='switch'],[data-no-open]"

/**
 * How a card or a row opens (docs/blocks-brief.md, decisions 3 and 5): a click or Enter opens
 * the record in the side pane (`href`, through `usePane().openSide`) or calls `onOpen` where
 * the page keeps a dialog; ⌘-click opens a browser tab. Clicks
 * on controls inside and clicks that end a text selection do nothing.
 */
export function useOpen({ href, onOpen }: { href?: string; onOpen?: () => void }) {
  const pane = usePane()
  const enabled = !!(href || onOpen)
  const activate = React.useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      if (!enabled) return
      const target = e.target as HTMLElement
      if (target !== e.currentTarget && target.closest(INTERACTIVE)) return
      if ("button" in e && window.getSelection()?.toString()) return
      if (href && "metaKey" in e && (e.metaKey || e.ctrlKey)) {
        window.open(href, "_blank")
        return
      }
      if (onOpen) onOpen()
      else if (href) pane.openSide(href)
    },
    [enabled, href, onOpen, pane],
  )
  return {
    enabled,
    onClick: activate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.target === e.currentTarget) {
        e.preventDefault()
        activate(e)
      }
    },
  }
}
