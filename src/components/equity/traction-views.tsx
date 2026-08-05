"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PhotoGallery } from "@/components/equity/photo-gallery";

/**
 * Traction: the milestones one under another down a spine, oldest at the top,
 * all of them open. Nothing to drag and nothing hidden, which is what makes it
 * work the same on a phone, in a print-out, and for anyone skimming.
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

/** How far through the panel the reader is, for whoever is showing the count. */
export type TractionProgress = { at: number; scrolls: boolean };

/**
 * The count, for the header of whatever this list is sitting in. The step
 * you're on is picked out and the total left quiet behind it, since the total
 * is the same every time you look.
 */
export function TractionCount({ at, total }: { at: number; total: number }) {
  return (
    <span className="text-[11px] tabular-nums shrink-0">
      {/* The report's accent, the same one marking the step you're reading. */}
      <span style={{ color: ACCENT }}>{at + 1}/</span>
      <span className="text-muted-foreground/50">{total}</span>
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
      className="max-h-[520px] overflow-y-auto overscroll-contain pr-3"
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
              className="relative pl-8"
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
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70 tabular-nums">
                  Step {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {longDay(milestone.happenedOn)}
                </span>
                {ahead && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                    Upcoming
                  </span>
                )}
              </div>

              <p
                className={cn(
                  "text-[15px] font-semibold mt-1.5",
                  ahead ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {milestone.title}
              </p>
              {milestone.body && (
                <p className="text-[12px] text-muted-foreground mt-2 whitespace-pre-wrap max-w-[70ch]">
                  {milestone.body}
                </p>
              )}

              {/* Held to the width of the text it follows, so a milestone with
                a photo doesn't shout over the ones without. Click to enlarge. */}
              {milestone.photoUrl && (
                <PhotoGallery
                  photos={[
                    { id: milestone.id, url: milestone.photoUrl, caption: null },
                  ]}
                  className="grid-cols-1 max-w-[420px] mt-3"
                  defaultColumns={1}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
