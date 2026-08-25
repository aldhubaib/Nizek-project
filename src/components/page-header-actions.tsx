"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Buttons a page wants in the top-right corner, placed in the shell chrome
 * rather than underneath it. Overflow actions (settings, edit, delete)
 * belong in `PageOverflowItems` so they share the shell's single ⋮ menu.
 *
 * The shell keeps a slot in the top-right chrome, and a page fills it from
 * wherever the button naturally lives in its markup.
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
