"use client";

import { useEffect } from "react";

/**
 * Menus, tooltips and sheets render into <body>, outside the `.nx` wrapper. While the new UI
 * is on screen, the same classes (tokens and the Inter variable) go on <html> too, so those
 * portals look the same. Removed again when the user leaves for the live panel.
 */
export function NxRoot({ className }: { className: string }) {
  useEffect(() => {
    const classes = className.split(/\s+/).filter(Boolean);
    const root = document.documentElement;
    root.classList.add(...classes);
    return () => root.classList.remove(...classes);
  }, [className]);
  return null;
}
