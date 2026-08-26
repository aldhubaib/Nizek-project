"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Film, Play, X } from "lucide-react";
import { getTaskProofVideos, type TaskProofVideo } from "@/actions/proof-of-work";
import { CountBadge } from "@/components/ui/count-badge";
import { useProofOutbox } from "@/lib/proof-outbox";
import { useScrollLock } from "@/hooks/use-scroll-lock";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VideoPlayer({
  videos,
  index,
  onClose,
  onIndex,
}: {
  videos: TaskProofVideo[];
  index: number;
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
      className="fixed inset-0 z-[250] flex flex-col bg-black/90"
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
            {videos.length > 1 ? `${index + 1} of ${videos.length}` : "Proof of work"}
            {current.fileSize ? ` · ${formatFileSize(current.fileSize)}` : ""}
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

export function ProofVideosSection({ taskId }: { taskId: string }) {
  const [videos, setVideos] = useState<TaskProofVideo[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const outbox = useProofOutbox();
  const uploading = outbox.filter(
    (e) => e.taskId === taskId && (e.status === "uploading" || e.status === "submitting"),
  );

  const load = useCallback(() => {
    void getTaskProofVideos(taskId).then(setVideos).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onComplete(e: Event) {
      const taskIdDone = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (taskIdDone === taskId) load();
    }
    window.addEventListener("proof-upload-complete", onComplete);
    return () => window.removeEventListener("proof-upload-complete", onComplete);
  }, [taskId, load]);

  if (videos.length === 0 && uploading.length === 0) return null;

  const playing = playingIndex != null ? videos[playingIndex] : null;

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
      <div className="flex items-center gap-2 px-1 py-4">
        <Film className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-s font-semibold">Proof of work</h3>
        {videos.length > 0 && <CountBadge count={videos.length} size="sm" muted />}
      </div>
      <div className="space-y-1">
        {uploading.flatMap((entry) =>
          entry.files.map((file) => (
            <div
              key={file.key}
              className="flex w-full items-center gap-3 rounded-md border border-border bg-field px-3 py-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-orange/15 text-orange">
                <Film className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-s font-semibold text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.status === "submitting" ? "Saving…" : `Uploading… ${file.progress}%`}
                </p>
              </div>
            </div>
          )),
        )}
        {videos.map((video, i) => (
          <button
            key={video.id}
            type="button"
            onClick={() => setPlayingIndex(i)}
            className="flex w-full items-center gap-3 text-start rounded-md border border-border bg-field px-3 py-3 hover:border-foreground/40 transition-colors"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-orange/15 text-orange">
              <Play className="size-4 fill-current" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-s font-semibold text-foreground">{video.filename}</p>
              {video.fileSize ? (
                <p className="text-xs text-muted-foreground">{formatFileSize(video.fileSize)}</p>
              ) : null}
            </div>
          </button>
        ))}
      </div>
      {playing && playingIndex != null ? (
        <VideoPlayer
          videos={videos}
          index={playingIndex}
          onClose={() => setPlayingIndex(null)}
          onIndex={setPlayingIndex}
        />
      ) : null}
    </div>
  );
}
