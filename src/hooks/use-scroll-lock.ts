import { useEffect } from "react";

const ATTR = "data-scroll-locked";
let refCount = 0;

function isInsideScrollable(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function blockTouchMove(e: TouchEvent) {
  if (!isInsideScrollable(e.target)) {
    e.preventDefault();
  }
}

function blockWheel(e: WheelEvent) {
  if (!isInsideScrollable(e.target)) {
    e.preventDefault();
  }
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    refCount++;
    const html = document.documentElement;

    if (refCount === 1) {
      html.setAttribute(ATTR, "");
      document.addEventListener("touchmove", blockTouchMove, { passive: false });
      document.addEventListener("wheel", blockWheel, { passive: false });
    }

    return () => {
      refCount--;
      if (refCount === 0) {
        html.removeAttribute(ATTR);
        document.removeEventListener("touchmove", blockTouchMove);
        document.removeEventListener("wheel", blockWheel);
      }
    };
  }, [active]);
}
