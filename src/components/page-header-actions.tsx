"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Buttons a page wants in the top-right corner, placed beside the notification
 * bell rather than underneath it.
 *
 * The bell is fixed to the corner by the dashboard shell, so anything a page
 * draws at the right edge of its own header lands on top of it. The shell keeps
 * a slot next to the bell instead, and a page fills it from wherever the button
 * naturally lives in its markup — the bell first, the page's own controls after.
 */
export const PAGE_HEADER_ACTIONS_SLOT = "page-header-actions";

export function PageHeaderActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // The slot is rendered by the shell, so it only exists once the tree has been
  // committed — there is nothing to read during the first render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSlot(document.getElementById(PAGE_HEADER_ACTIONS_SLOT)), []);

  return slot ? createPortal(children, slot) : null;
}
