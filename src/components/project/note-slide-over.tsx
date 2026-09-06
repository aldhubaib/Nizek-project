"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const HEADER_LEFT_SLOT = "data-sprint-doc-header-left";

/** Renders in the nearest slide-over header, on the right, when that slot exists. */
export function SprintDocHeaderLeft({ children }: { children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = probe.current?.closest("[data-slide-over]");
    const found =
      root?.querySelector(`[${HEADER_LEFT_SLOT}]`) ??
      document.querySelector(`[${HEADER_LEFT_SLOT}]`);
    setSlot(found instanceof HTMLElement ? found : null);
  }, []);
  if (!children) return null;
  return (
    <>
      <span ref={probe} hidden />
      {slot ? createPortal(children, slot) : children}
    </>
  );
}

const SLIDE_OVER_THEME_COLOR = "#1c1c1e";

/**
 * Every side panel in the app. Full-bleed at any size — it still slides in
 * from the right, but covers the page rather than leaving a peek behind it.
 */
export function NoteSlideOver({
  title,
  headerRight,
  onClose,
  children,
  className,
  bodyClassName,
  allowOverflowX = false,
  instant = false,
}: {
  title: ReactNode;
  headerRight?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Let the body scroll sideways from lg (road map). Mobile stays vertical. */
  allowOverflowX?: boolean;
  /** Skip the slide-in — used when the panel is restored from the URL. */
  instant?: boolean;
}) {
  useScrollLock(true);

  useEffect(() => {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    const prev = Array.from(metas).map((m) => m.getAttribute("content"));
    metas.forEach((m) => m.setAttribute("content", SLIDE_OVER_THEME_COLOR));
    return () => {
      metas.forEach((m, i) => {
        if (prev[i] != null) m.setAttribute("content", prev[i]!);
      });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opaque and isolated at 850. A dialog opened from inside here that portals
  // to document.body becomes a sibling of this element rather than a child, so
  // it has to sit above 850 or it is painted behind an opaque background and
  // never seen. Those dialogs use 900.
  const ui = (
    <div
      data-slide-over
      data-scroll-lock-root
      className="fixed inset-0 z-[850] isolate flex overflow-hidden overscroll-none bg-background"
      style={{ zIndex: 850 }}
    >
      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 min-w-0 w-full flex-col overscroll-none bg-background",
          !instant && "animate-in slide-in-from-right duration-200",
          className,
        )}
      >
        <header className="z-10 shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top,0px)]">
          <div className="flex h-14 items-center gap-2 px-2 sm:px-3">
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              {typeof title === "string" ? (
                <div className="truncate text-s font-semibold">{title}</div>
              ) : (
                title
              )}
            </div>
            <div data-sprint-doc-header-left className="flex shrink-0 items-center gap-2" />
            {headerRight ? <div className="flex shrink-0 items-center">{headerRight}</div> : null}
          </div>
        </header>
        <div
          data-allow-overflow-x={allowOverflowX ? "" : undefined}
          className={cn(
            "min-h-0 min-w-0 flex-1 overscroll-contain bg-background",
            allowOverflowX
              ? "overflow-y-auto overflow-x-hidden lg:overflow-x-scroll lg:overflow-y-hidden"
              : "overflow-y-auto",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(ui, document.body);
}
