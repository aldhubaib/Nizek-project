"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

/**
 * Chat-opened note: full-bleed on mobile, slides in from the right on
 * desktop and leaves a peek of the inbox that grows with the viewport.
 */
export function NoteSlideOver({
  title,
  headerRight,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  headerRight?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useScrollLock(mounted);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  const ui = (
    <div data-slide-over className="fixed inset-0 z-[200] flex justify-end overflow-hidden overscroll-none">
      <button
        type="button"
        aria-label="Close note"
        onClick={onClose}
        className="absolute inset-0 hidden touch-none bg-overlay lg:block"
      />
      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 w-full flex-col overscroll-none bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200",
          "lg:w-[min(100%,max(45rem,calc(100%-min(24vw,20rem))))] lg:border-s lg:border-border",
          className,
        )}
      >
        <header className="z-10 flex app-top-bar shrink-0 items-center gap-xs border-b border-border px-2 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 truncate text-s font-semibold">{title}</div>
          {headerRight}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(ui, document.body);
}
