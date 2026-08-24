"use client";

import { useEffect } from "react";

export const APP_CHROME_AWAY = "app-chrome-away";
const SHOW_AFTER_MS = 220;

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function isOverlayScroller(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  return Boolean(el.closest("[data-scroll-lock-root], [data-slide-over]"));
}

export function isPageScroller(target: EventTarget | null) {
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

/** Overlay / locked scroll must not tuck away the page title bar behind a panel. */
export function shouldHideChromeOnScroll(target: EventTarget | null): boolean {
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-scroll-locked")) {
    return false;
  }
  if (isOverlayScroller(target)) return false;
  return isPageScroller(target);
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
      root.classList.remove(APP_CHROME_AWAY);
      return;
    }

    let timer = 0;
    const show = () => root.classList.remove(APP_CHROME_AWAY);
    const hide = () => {
      root.classList.add(APP_CHROME_AWAY);
      window.clearTimeout(timer);
      timer = window.setTimeout(show, SHOW_AFTER_MS);
    };

    const onScroll = (event: Event) => {
      if (!shouldHideChromeOnScroll(event.target)) {
        window.clearTimeout(timer);
        show();
        return;
      }
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
