"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

export type GalleryPhoto = { id: string; url: string; caption: string | null };

/**
 * How many columns a grid is actually showing, measured rather than guessed.
 *
 * The grids here are responsive, so "two rows" is a different number of photos
 * at every width. Reading the tracks off the element keeps the cut-off honest
 * without the caller having to restate its own breakpoints as numbers.
 */
function useGridColumns(
  ref: RefObject<HTMLDivElement | null>,
  fallback: number,
) {
  const [columns, setColumns] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fires once on observe, which is what sets the first real value.
    const observer = new ResizeObserver(() => {
      const tracks = getComputedStyle(el)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      setColumns(Math.max(tracks, 1));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

/**
 * Photos as a grid two rows deep, with the rest behind the last tile.
 *
 * A product can have a dozen screenshots and none of them is the report — two
 * rows is enough to show what it looks like, and the count on the last tile
 * says how much more there is rather than hiding it. Clicking any of them
 * opens the lot full-size.
 */
export function PhotoGallery({
  photos,
  className,
  defaultColumns,
  rows = 2,
}: {
  photos: GalleryPhoto[];
  /** The grid's column classes — the gallery counts whatever they resolve to. */
  className: string;
  /** What to assume for the first paint, before the grid has been measured. */
  defaultColumns: number;
  rows?: number;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef, defaultColumns);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const limit = columns * rows;
  const shown = photos.slice(0, limit);
  const hidden = photos.length - shown.length;

  return (
    <>
      <div ref={gridRef} className={cn("grid gap-x-4 gap-y-6", className)}>
        {shown.map((photo, i) => {
          const last = i === shown.length - 1;
          return (
            <figure key={photo.id} className="m-0">
              <button
                type="button"
                onClick={() => setOpenAt(i)}
                className="relative block w-full p-0 border-0 bg-transparent cursor-zoom-in group"
                aria-label={
                  last && hidden > 0
                    ? `Open all ${photos.length} photos`
                    : photo.caption || "Open photo"
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-border/60 bg-muted/20 transition-opacity group-hover:opacity-90"
                />
                {last && hidden > 0 && (
                  <span className="absolute inset-0 grid place-items-center rounded-xl bg-background/70 backdrop-blur-[2px] text-m font-semibold text-foreground transition-colors group-hover:bg-background/60">
                    +{hidden}
                  </span>
                )}
              </button>
              {photo.caption && !(last && hidden > 0) && (
                <figcaption className="text-xs text-muted-foreground mt-2.5">
                  {photo.caption}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>

      {openAt !== null && photos[openAt] && (
        <PhotoLightbox
          photos={photos}
          index={openAt}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const current = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  useScrollLock(true);

  // Straight onto the body: the report sits inside scrolling, stacking panels,
  // and a viewer that covers the page has to escape all of them.
  return createPortal(
    <div
      data-scroll-lock-root
      className="fixed inset-0 z-[200] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-s text-white/70 truncate">
          {current.caption ?? ""}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-s text-white/40 tabular-nums">
            {index + 1} / {photos.length}
          </span>
          <a
            href={current.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors no-underline"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative px-16 min-h-0">
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            aria-label="Previous photo"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.caption ?? ""}
          className="max-w-full max-h-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            aria-label="Next photo"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 px-5 py-3 shrink-0 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Photo ${i + 1}`}
              className={cn(
                "w-12 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0",
                i === index
                  ? "border-white opacity-100"
                  : "border-transparent opacity-40 hover:opacity-70",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
