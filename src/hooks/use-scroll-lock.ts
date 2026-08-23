import { useEffect } from "react";

const ATTR = "data-scroll-locked";
let refCount = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    refCount++;
    const html = document.documentElement;

    if (refCount === 1) {
      html.setAttribute(ATTR, "");
    }

    return () => {
      refCount--;
      if (refCount === 0) {
        html.removeAttribute(ATTR);
      }
    };
  }, [active]);
}
