"use client";

import { useEffect, useRef } from "react";
import { isSoftKeyboardOpen } from "@/lib/soft-keyboard";

/**
 * Pins an element to the visual viewport so soft keyboards on mobile don't
 * cover the composer (h-dvh often does not shrink, especially on iOS).
 * Also restores window scroll when the keyboard closes (iOS PWA sticky offset).
 */
export function useVisualViewportFrame<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    let baselineHeight = Math.max(window.innerHeight, vv.height);

    const applyOpen = () => {
      el.style.position = "fixed";
      el.style.top = `${vv.offsetTop}px`;
      el.style.left = `${vv.offsetLeft}px`;
      el.style.right = "auto";
      el.style.width = `${vv.width}px`;
      el.style.height = `${vv.height}px`;
      el.style.zIndex = "50";
      el.style.touchAction = "manipulation";
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };

    const applyClosed = () => {
      el.style.position = "";
      el.style.top = "";
      el.style.left = "";
      el.style.right = "";
      el.style.width = "";
      el.style.height = "";
      el.style.zIndex = "";
      el.style.touchAction = "";
      if (window.scrollY !== 0 || window.scrollX !== 0 || vv.offsetTop !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const sync = () => {
      const open = isSoftKeyboardOpen({
        visualHeight: vv.height,
        layoutHeight: window.innerHeight,
        baselineHeight,
      });
      if (open) {
        applyOpen();
      } else {
        baselineHeight = Math.max(window.innerHeight, vv.height);
        applyClosed();
      }
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("focusin", sync);
    window.addEventListener("focusout", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("focusin", sync);
      window.removeEventListener("focusout", sync);
      applyClosed();
    };
  }, []);

  return ref;
}
