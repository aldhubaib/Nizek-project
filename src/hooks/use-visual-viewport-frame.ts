"use client";

import { useEffect, useRef } from "react";

/**
 * Pins an element to the visual viewport so soft keyboards on mobile don't
 * cover the bottom of a full-height chat layout (h-dvh often does not shrink).
 * Also restores window scroll when the keyboard closes (iOS PWA sticky offset).
 */
export function useVisualViewportFrame<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    const keyboardOpen = () => vv.height < window.innerHeight - 60;

    const sync = () => {
      if (keyboardOpen()) {
        el.style.position = "fixed";
        el.style.top = `${vv.offsetTop}px`;
        el.style.left = "0";
        el.style.right = "0";
        el.style.width = "100%";
        el.style.height = `${vv.height}px`;
        el.style.zIndex = "50";
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      } else {
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.right = "";
        el.style.width = "";
        el.style.height = "";
        el.style.zIndex = "";
        if (window.scrollY !== 0 || vv.offsetTop !== 0) {
          window.scrollTo(0, 0);
        }
      }
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("focusout", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("focusout", sync);
      el.style.position = "";
      el.style.top = "";
      el.style.left = "";
      el.style.right = "";
      el.style.width = "";
      el.style.height = "";
      el.style.zIndex = "";
    };
  }, []);

  return ref;
}
