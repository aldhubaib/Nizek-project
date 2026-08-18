"use client";

import { useEffect } from "react";

const HIDDEN = "app-chrome-away";
const SHOW_AFTER_MS = 220;

function isPageScroller(target: EventTarget | null) {
  if (
    target === document ||
    target === document.documentElement ||
    target === document.body
  ) {
    return true;
  }
  if (!(target instanceof HTMLElement)) return false;
  return target.clientHeight >= window.innerHeight * 0.65;
}

function scrollTopOf(target: EventTarget | null) {
  if (
    target instanceof HTMLElement &&
    target !== document.documentElement &&
    target !== document.body
  ) {
    return target.scrollTop;
  }
  return window.scrollY;
}

/** Hide the page title bar while scrolling; show it again once the scroll stops. */
export function useHideHeaderOnScroll(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.classList.remove(HIDDEN);
      return;
    }

    let timer = 0;
    const show = () => root.classList.remove(HIDDEN);
    const hide = () => {
      root.classList.add(HIDDEN);
      window.clearTimeout(timer);
      timer = window.setTimeout(show, SHOW_AFTER_MS);
    };

    const onScroll = (event: Event) => {
      if (!isPageScroller(event.target)) return;
      if (scrollTopOf(event.target) <= 8) {
        window.clearTimeout(timer);
        show();
        return;
      }
      hide();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(timer);
      show();
    };
  }, [enabled]);
}
