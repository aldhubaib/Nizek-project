"use client";

import { useEffect } from "react";

/**
 * iOS Safari (and standalone PWAs) ignore user-scalable=no. Block pinch and
 * the Safari gesture events so the installed app can't zoom like a webpage.
 */
export function DisablePinchZoom() {
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    document.addEventListener("gestureend", preventGesture);
    document.addEventListener("touchmove", preventMultiTouch, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchmove", preventMultiTouch);
    };
  }, []);

  return null;
}
