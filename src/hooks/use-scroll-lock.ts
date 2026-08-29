import { useEffect } from "react";

const ATTR = "data-scroll-locked";
export const SCROLL_LOCK_ROOT_SEL = "[data-scroll-lock-root]";
export const ALLOW_OVERFLOW_X_SEL = "[data-allow-overflow-x]";

let refCount = 0;
let lastTouchX: number | null = null;
let lastTouchY: number | null = null;

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function findScrollLockRoot(target: EventTarget | null): HTMLElement | null {
  const el = asElement(target);
  if (!el) return null;
  return el.closest(SCROLL_LOCK_ROOT_SEL);
}

export function canElementScrollInDirection(node: HTMLElement, deltaY: number): boolean {
  const maxScroll = node.scrollHeight - node.clientHeight;
  if (maxScroll <= 0) return false;
  if (deltaY < 0) return node.scrollTop > 0;
  if (deltaY > 0) return node.scrollTop < maxScroll - 0.5;
  return true;
}

export function canElementScrollX(node: HTMLElement, deltaX: number): boolean {
  const maxScroll = node.scrollWidth - node.clientWidth;
  if (maxScroll <= 0) return false;
  if (deltaX < 0) return node.scrollLeft > 0;
  if (deltaX > 0) return node.scrollLeft < maxScroll - 0.5;
  return true;
}

function isScrollableOverflow(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}

export function findScrollableAncestorInRoot(
  target: EventTarget | null,
  root: HTMLElement,
): HTMLElement | null {
  let node: HTMLElement | null = asElement(target) as HTMLElement | null;
  while (node && root.contains(node)) {
    const { overflowY } = getComputedStyle(node);
    if (isScrollableOverflow(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return null;
}

/** Allow the gesture only inside a lock root that still has room to scroll. */
export function shouldAllowLockedScroll(
  target: EventTarget | null,
  deltaY: number,
  deltaX = 0,
): boolean {
  const root = findScrollLockRoot(target);
  if (!root) return false;
  const origin = asElement(target);
  if (origin?.closest(ALLOW_OVERFLOW_X_SEL)) return true;
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  let node: HTMLElement | null = asElement(target) as HTMLElement | null;
  while (node && root.contains(node)) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (
      !horizontal &&
      isScrollableOverflow(overflowY) &&
      node.scrollHeight > node.clientHeight &&
      canElementScrollInDirection(node, deltaY)
    ) {
      return true;
    }
    if (
      (horizontal || deltaX !== 0) &&
      isScrollableOverflow(overflowX) &&
      node.scrollWidth > node.clientWidth &&
      canElementScrollX(node, deltaX)
    ) {
      return true;
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return false;
}

function blockWheel(e: WheelEvent) {
  if (!shouldAllowLockedScroll(e.target, e.deltaY, e.deltaX)) {
    e.preventDefault();
  }
}

function onTouchStart(e: TouchEvent) {
  lastTouchX = e.touches[0]?.clientX ?? null;
  lastTouchY = e.touches[0]?.clientY ?? null;
}

function blockTouchMove(e: TouchEvent) {
  const x = e.touches[0]?.clientX;
  const y = e.touches[0]?.clientY;
  const deltaX = lastTouchX != null && x != null ? lastTouchX - x : 0;
  const deltaY = lastTouchY != null && y != null ? lastTouchY - y : 0;
  lastTouchX = x ?? lastTouchX;
  lastTouchY = y ?? lastTouchY;
  if (!shouldAllowLockedScroll(e.target, deltaY, deltaX)) {
    e.preventDefault();
  }
}

function onTouchEnd() {
  lastTouchX = null;
  lastTouchY = null;
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    refCount++;
    const html = document.documentElement;

    if (refCount === 1) {
      html.setAttribute(ATTR, "");
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", blockTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: true });
      document.addEventListener("touchcancel", onTouchEnd, { passive: true });
      document.addEventListener("wheel", blockWheel, { passive: false });
    }

    return () => {
      refCount--;
      if (refCount === 0) {
        html.removeAttribute(ATTR);
        lastTouchX = null;
        lastTouchY = null;
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", blockTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
        document.removeEventListener("wheel", blockWheel);
      }
    };
  }, [active]);
}
