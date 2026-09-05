"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { format } from "date-fns";

/**
 * How a proof recording is listed and played, wherever it is shown.
 *
 * A recording is not something anybody reads at a glance, so it is listed as a
 * file — name, size, date — and opens full screen when asked for. Embedding the
 * players inline instead would turn a sprint of fifteen delivered items into a
 * page of fifteen video frames with the document lost between them.
 */
export type ProofVideoView = {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  /** When the proof this belongs to was captured. */
  createdAt: string | Date;
};

const APPROVED_TAG = outlineBadge("Approved", "text-success", "border-success/30");
const REJECTED_TAG = outlineBadge("Rejected", "text-destructive", "border-destructive/30");

export function formatProofFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProofVideoPlayer({
  videos,
  index,
  label,
  onClose,
  onIndex,
}: {
  videos: ProofVideoView[];
  index: number;
  label: string;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  useScrollLock(true);
  const current = videos[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && videos.length > 1) onIndex((index + 1) % videos.length);
      if (e.key === "ArrowLeft" && videos.length > 1) {
        onIndex((index - 1 + videos.length) % videos.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, videos.length, onClose, onIndex]);

  if (!current) return null;

  return createPortal(
    <div
      data-scroll-lock-root
      // Above the full-screen surfaces a proof row can be listed on — the sprint
      // document opens in a slide-over at 850, and this portals to the body, so
      // anything lower plays the video behind the page that asked for it.
      className="fixed inset-0 z-[950] flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.filename}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-s font-medium">{current.filename}</div>
          <div className="text-s text-white/60">
            {videos.length > 1 ? `${index + 1} of ${videos.length}` : label}
            {current.fileSize ? ` · ${formatProofFileSize(current.fileSize)}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {videos.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndex((index - 1 + videos.length) % videos.length)}
            className="absolute left-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        <video
          key={current.id}
          src={current.url}
          controls
          autoPlay
          playsInline
          className="max-h-[calc(100dvh-6.5rem)] max-w-full rounded-lg"
        />
        {videos.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndex((index + 1) % videos.length)}
            className="absolute right-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ProofVideoRow({
  video,
  tag,
  onPlay,
}: {
  video: ProofVideoView;
  tag: "approved" | "rejected";
  onPlay: () => void;
}) {
  const meta = [
    video.fileSize ? formatProofFileSize(video.fileSize) : null,
    format(new Date(video.createdAt), "MMM d, yyyy"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onPlay}
      className="flex w-full items-center gap-3 text-start rounded-md border border-border bg-field px-3 py-3 hover:border-foreground/40 transition-colors"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-orange/15 text-orange">
        <Play className="size-4 fill-current" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-s font-semibold text-foreground">{video.filename}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <StatusBadge size="xs" config={tag === "approved" ? APPROVED_TAG : REJECTED_TAG} />
    </button>
  );
}

/** Rows plus the player they open, for callers with nothing else to track. */
export function ProofVideoList({
  videos,
  label = "Proof of work",
  tag = "approved",
}: {
  videos: ProofVideoView[];
  label?: string;
  tag?: "approved" | "rejected";
}) {
  const [playing, setPlaying] = useState<number | null>(null);
  if (videos.length === 0) return null;

  return (
    <div className="space-y-1">
      {videos.map((video, i) => (
        <ProofVideoRow key={video.id} video={video} tag={tag} onPlay={() => setPlaying(i)} />
      ))}
      {playing != null ? (
        <ProofVideoPlayer
          videos={videos}
          index={playing}
          label={label}
          onClose={() => setPlaying(null)}
          onIndex={setPlaying}
        />
      ) : null}
    </div>
  );
}
