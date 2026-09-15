"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { filterNoteSymbols } from "@/components/tiptap/note-symbols";

interface NoteSymbolPickerProps {
  x: number;
  y: number;
  onPick: (glyph: string) => void;
  onClose: () => void;
}

export const NoteSymbolPicker = forwardRef<HTMLDivElement, NoteSymbolPickerProps>(
  ({ x, y, onPick, onClose }, ref) => {
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const matches = useMemo(() => filterNoteSymbols(query), [query]);
    const left = Math.min(x, Math.max(8, window.innerWidth - 300));
    const top = Math.min(y, Math.max(8, window.innerHeight - 280));

    useEffect(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, []);

    return createPortal(
      <div
        ref={ref}
        className="fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        style={{ left, top }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Symbols
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <div className="px-2 pb-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search check, cross, arrow…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-s outline-none focus:border-primary/40"
          />
        </div>
        <div className="max-h-56 overflow-y-auto px-2 pb-2">
          {matches.length === 0 ? (
            <p className="px-1 py-4 text-s text-muted-foreground">No matching symbols.</p>
          ) : (
            <div className="grid grid-cols-6 gap-xs">
              {matches.map((item) => (
                <button
                  key={`${item.glyph}-${item.label}`}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => onPick(item.glyph)}
                  className={cn(
                    "app-touch-target flex size-8 items-center justify-center rounded-md text-m transition-colors",
                    "hover:bg-accent",
                  )}
                >
                  {item.glyph}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  },
);
NoteSymbolPicker.displayName = "NoteSymbolPicker";
