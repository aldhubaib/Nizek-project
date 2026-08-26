import { useEffect } from "react";

const ATTR = "data-scroll-locked";
export const SCROLL_LOCK_ROOT_SEL = "[data-scroll-lock-root]";

let refCount = 0;
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

function isScrollableOverflow(overflowY: string): boolean {
  return overflowY === "auto" || overflowY === "scroll";
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
export function shouldAllowLockedScroll(target: EventTarget | null, deltaY: number): boolean {
  const root = findScrollLockRoot(target);
  if (!root) return false;
  let node: HTMLElement | null = asElement(target) as HTMLElement | null;
  while (node && root.contains(node)) {
    const { overflowY } = getComputedStyle(node);
    if (
      isScrollableOverflow(overflowY) &&
      node.scrollHeight > node.clientHeight &&
      canElementScrollInDirection(node, deltaY)
    ) {
      return true;
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return false;
}

function blockWheel(e: WheelEvent) {
  if (!shouldAllowLockedScroll(e.target, e.deltaY)) {
    e.preventDefault();
  }
}

function onTouchStart(e: TouchEvent) {
  lastTouchY = e.touches[0]?.clientY ?? null;
}

function blockTouchMove(e: TouchEvent) {
  const y = e.touches[0]?.clientY;
  const deltaY = lastTouchY != null && y != null ? lastTouchY - y : 0;
  lastTouchY = y ?? lastTouchY;
  if (!shouldAllowLockedScroll(e.target, deltaY)) {
    e.preventDefault();
  }
}

function onTouchEnd() {
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
