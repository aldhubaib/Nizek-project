"use client";

import * as React from "react";

import { usePaneStore } from "./pane-store";

/** The keyboard map (panes brief, decision 10) and nothing else. */
export type PaneAction = { type: "activate"; index: number } | { type: "close" } | { type: "swap" } | { type: "escape" };

/** The slice of a KeyboardEvent the map reads; plain objects in tests. */
export interface PaneKeyEvent {
  code: string;
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Typing targets: shortcuts never fire there. */
export function isEditable(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (EDITABLE.has(target.tagName)) return true;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const role = el.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** ⌥1–⌥8 switch tray entry · ⌥W close · ⌥⇧S swap · Esc (handled by the caller when focus is in the side pane). */
export function paneKeyAction(e: PaneKeyEvent): PaneAction | null {
  if (e.defaultPrevented || isEditable(e.target)) return null;
  if (e.key === "Escape" && !e.altKey && !e.metaKey && !e.ctrlKey) return { type: "escape" };
  if (!e.altKey || e.metaKey || e.ctrlKey) return null;
  const digit = /^Digit([1-8])$/.exec(e.code);
  if (digit && !e.shiftKey) return { type: "activate", index: Number(digit[1]) - 1 };
  if (e.code === "KeyW" && !e.shiftKey) return { type: "close" };
  if (e.code === "KeyS" && e.shiftKey) return { type: "swap" };
  return null;
}

function openDialog(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/** Mounts the window listener once; lives in the layout. */
export function PaneShortcuts() {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = paneKeyAction(e);
      if (!action) return;
      const store = usePaneStore.getState();
      if (!store.stack.length) return;
      if (action.type === "escape") {
        const inSide = e.target instanceof Element && !!e.target.closest('[data-pane="side"]');
        if (!inSide || openDialog()) return;
        e.preventDefault();
        store.close();
        return;
      }
      e.preventDefault();
      if (action.type === "activate") store.activate(action.index);
      else if (action.type === "close") store.close();
      else store.swap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
