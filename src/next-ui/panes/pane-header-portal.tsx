"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { PaneContext } from "./use-pane";

/**
 * Puts a page's actions (search, primary button) in the header of the pane it renders in.
 * Nothing is shown until the slot exists, so the actions never flash in the body first. When
 * the header is too narrow the actions go to the More menu instead; `pin` keeps a small item
 * (the search icon) in the header regardless.
 */
export function PaneHeaderPortal({ children, pin }: { children: React.ReactNode; pin?: boolean }) {
  const { actions, overflow, mode } = React.useContext(PaneContext);
  const target = pin || mode === "header" ? actions : overflow;
  if (!target) return null;
  return createPortal(children, target);
}
