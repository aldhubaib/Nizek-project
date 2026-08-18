"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button
        type="button"
        aria-label="Close note"
        onClick={onClose}
        className="absolute inset-0 hidden bg-black/40 lg:block"
      />
      <div
        className={cn(
          "relative z-10 flex h-full w-full flex-col bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200",
          "lg:w-[min(100%,max(45rem,calc(100%-min(24vw,20rem))))] lg:border-s lg:border-border",
          className,
        )}
      >
        <header className="flex app-top-bar shrink-0 items-center gap-xs border-b border-border px-2 sm:px-3">
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
        {children}
      </div>
    </div>
  );
}
