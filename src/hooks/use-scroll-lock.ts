import { useEffect } from "react";

const ATTR = "data-scroll-locked";
let refCount = 0;
let savedScrollY = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    refCount++;
    const html = document.documentElement;

    if (refCount === 1) {
      savedScrollY = window.scrollY;
      html.setAttribute(ATTR, "");
      document.body.style.top = `-${savedScrollY}px`;
    }

    return () => {
      refCount--;
      if (refCount === 0) {
        html.removeAttribute(ATTR);
        document.body.style.top = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
