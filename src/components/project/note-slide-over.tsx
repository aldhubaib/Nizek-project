"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

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
}: {
  title: ReactNode;
  headerRight?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
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

  const ui = (
    <div
      data-slide-over
      data-scroll-lock-root
      className="fixed inset-0 z-[850] isolate flex overflow-hidden overscroll-none bg-background"
      style={{ zIndex: 850 }}
    >
      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 w-full flex-col overscroll-none bg-background",
          "animate-in slide-in-from-right duration-200",
          className,
        )}
      >
        <header className="z-10 flex app-top-bar-tall shrink-0 items-center gap-xs border-b border-border bg-background px-2 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:size-9 lg:rounded-md"
            aria-label="Close"
          >
            {/* Points the way the panel leaves — it slides back off the right. */}
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? (
              <div className="truncate text-s font-semibold">{title}</div>
            ) : (
              title
            )}
          </div>
          {headerRight}
        </header>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background",
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
