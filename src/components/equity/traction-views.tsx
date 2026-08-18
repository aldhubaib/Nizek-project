"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PhotoGallery } from "@/components/equity/photo-gallery";

/**
 * Traction: the milestones one under another down a spine, in whatever order
 * they're handed over (the report leads with the newest), all of them open.
 * Nothing to drag and nothing hidden, which is what makes it work the same on
 * a phone, in a print-out, and for anyone skimming.
 */

const ACCENT = "#ff3366";

export type Milestone = {
  id: string;
  happenedOn: string;
  title: string;
  body: string | null;
  photoUrl: string | null;
};

function longDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/** Dated ahead of today: a plan rather than a record, and drawn as one. */
function isUpcoming(iso: string) {
  return new Date(iso).getTime() > Date.now();
}

/**
 * The milestone's write-up, held to three lines with the rest behind
 * "Read more". Whether three lines actually cut anything off is measured
 * rather than guessed from the character count — where text wraps depends
 * on the column it's in.
 */
function MilestoneBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [text, open]);

  return (
    <div className="mt-2">
      <p
        ref={ref}
        className={cn(
          "text-muted-foreground whitespace-pre-wrap",
          !open && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors"
        >
          {open ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/** How far through the panel the reader is, for whoever is showing the count. */
export type TractionProgress = { at: number; scrolls: boolean };

/**
 * The count, for the header of whatever this list is sitting in. The step
 * you're on is picked out and the total left quiet behind it, since the total
 * is the same every time you look.
 */
export function TractionCount({ at, total }: { at: number; total: number }) {
  return (
    <span className="text-xs tabular-nums shrink-0">
      {/* The report's accent, the same one marking the step you're reading. */}
      <span style={{ color: ACCENT }}>{at + 1}/</span>
      <span className="text-foreground">{total}</span>
    </span>
  );
}

export function TractionTimeline({
  milestones,
  onProgress,
}: {
  milestones: Milestone[];
  onProgress?: (progress: TractionProgress) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  // Which step is being read, for the dot that marks it.
  const [at, setAt] = useState(0);
  // What was last settled on, so scrolling within one step doesn't keep
  // repainting the list or telling the header something it already knows.
  const sent = useRef<TractionProgress>({ at: 0, scrolls: false });

  function report(next: Partial<TractionProgress>) {
    const now = { ...sent.current, ...next };
    if (now.at === sent.current.at && now.scrolls === sent.current.scrolls)
      return;
    sent.current = now;
    setAt(now.at);
    onProgress?.(now);
  }

  /**
   * Which step is being read, and whether there's anything below the fold.
   *
   * The step is whichever one holds the middle of the panel. Reading off the
   * top instead would hand the accent to a step the moment its heading slid
   * out of sight, leaving it lit against a paragraph nobody can see.
   */
  function measure() {
    const box = boxRef.current;
    if (!box) return;
    const middle = box.scrollTop + box.clientHeight / 2;
    let seen = 0;
    steps.current.forEach((el, i) => {
      if (el && el.offsetTop <= middle) seen = i;
    });
    // The last step is often short enough that it never reaches the middle, so
    // the bottom of the panel counts as having arrived at it.
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    report({
      at: atEnd ? milestones.length - 1 : seen,
      scrolls: box.scrollHeight > box.clientHeight + 1,
    });
  }

  // Watched rather than measured once: photos land after the first paint, and
  // the panel is as tall as whatever it's been dropped into.
  useEffect(() => {
    const box = boxRef.current;
    const list = box?.firstElementChild;
    if (!box || !list) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /* Traction is the one module with no ceiling on how much of it there can
      be — every milestone ever, each with a paragraph. Left alone it would run
      longer than the rest of the report put together, so it keeps to a panel
      and scrolls inside it. */
    <div
      ref={boxRef}
      onScroll={measure}
      className="max-h-[520px] overflow-y-auto overscroll-contain pe-3"
    >
      <ol className="relative list-none p-0 m-0 space-y-8">
        {/* The spine, stopped short of the last dot so it doesn't dangle */}
        <span
          aria-hidden
          className="absolute left-[5px] top-2 bottom-8 w-px bg-border"
        />

        {milestones.map((milestone, i) => {
          const ahead = isUpcoming(milestone.happenedOn);
          const on = i === at;
          return (
            <li
              key={milestone.id}
              ref={(el) => {
                steps.current[i] = el;
              }}
              className="relative ps-8"
            >
              {/* The accent marks where you are, not what has been achieved:
                one dot lit at a time, so the list says which step is being
                read. Whether a milestone is done or still ahead is carried by
                its shape — solid or dashed — which holds either way. */}
              <span
                aria-hidden
                style={{ color: on ? ACCENT : undefined }}
                className={cn(
                  "absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full transition-colors",
                  ahead
                    ? "border border-dashed bg-background"
                    : "border-0 bg-current",
                  on
                    ? ahead
                      ? "border-current ring-4 ring-current/15"
                      : "ring-4 ring-current/15"
                    : ahead
                      ? "border-muted-foreground/50"
                      : "text-muted-foreground/40",
                )}
              />

              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70 tabular-nums">
                  {/* Numbered from the beginning of the journey, whichever end
                    of it the list leads with. */}
                  Step {String(milestones.length - i).padStart(2, "0")}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {longDay(milestone.happenedOn)}
                </span>
                {ahead && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                    Upcoming
                  </span>
                )}
              </div>

              <p
                className={cn(
                  "text-s font-semibold mt-1.5",
                  ahead ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {milestone.title}
              </p>
              {/* One column for the words and the photo both — the constraint
                lives on the wrapper so the two can't come out different
                widths. Click the photo to enlarge. */}
              {(milestone.body || milestone.photoUrl) && (
                <div className="max-w-[70ch] text-s">
                  {milestone.body && <MilestoneBody text={milestone.body} />}
                  {milestone.photoUrl && (
                    <PhotoGallery
                      photos={[
                        {
                          id: milestone.id,
                          url: milestone.photoUrl,
                          caption: null,
                        },
                      ]}
                      className="grid-cols-1 mt-3"
                      defaultColumns={1}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
