"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Film, History, Play, X } from "lucide-react";
import { getTaskProofVideos, type TaskProofVideo } from "@/actions/proof-of-work";
import { CountBadge } from "@/components/ui/count-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { useProofOutbox } from "@/lib/proof-outbox";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { format } from "date-fns";

const APPROVED_TAG = outlineBadge("Approved", "text-success", "border-success/30");
const REJECTED_TAG = outlineBadge("Rejected", "text-destructive", "border-destructive/30");

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VideoPlayer({
  videos,
  index,
  label,
  onClose,
  onIndex,
}: {
  videos: TaskProofVideo[];
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
            {videos.length > 1 ? `${index + 1} of ${videos.length}` : label}
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

function ProofSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 pb-3">
      <div className="flex items-center gap-2 px-1 py-4">
        {icon}
        <h3 className="text-s font-semibold">{title}</h3>
        {count > 0 && <CountBadge count={count} size="sm" muted />}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function VideoRow({
  video,
  tag,
  onPlay,
}: {
  video: TaskProofVideo;
  tag: "approved" | "rejected";
  onPlay: () => void;
}) {
  const meta = [
    video.fileSize ? formatFileSize(video.fileSize) : null,
    format(new Date(video.createdAt), "MMM d, yyyy"),
  ].filter(Boolean).join(" · ");

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

export function ProofVideosSection({
  taskId,
  taskStage,
}: {
  taskId: string;
  taskStage?: string;
}) {
  const [approved, setApproved] = useState<TaskProofVideo[]>([]);
  const [history, setHistory] = useState<TaskProofVideo[]>([]);
  const [playing, setPlaying] = useState<{ list: "approved" | "history"; index: number } | null>(null);
  const outbox = useProofOutbox();
  const uploading = outbox.filter(
    (e) => e.taskId === taskId && (e.status === "uploading" || e.status === "submitting"),
  );

  const load = useCallback(() => {
    void getTaskProofVideos(taskId)
      .then((groups) => {
        setApproved(groups.approved);
        setHistory(groups.history);
      })
      .catch(() => {});
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load, taskStage]);

  useEffect(() => {
    function onComplete(e: Event) {
      const taskIdDone = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (taskIdDone === taskId) load();
    }
    window.addEventListener("proof-upload-complete", onComplete);
    return () => window.removeEventListener("proof-upload-complete", onComplete);
  }, [taskId, load]);

  if (approved.length === 0 && history.length === 0 && uploading.length === 0) return null;

  const playingList = playing?.list === "history" ? history : approved;
  const playingVideo = playing ? playingList[playing.index] : null;

  return (
    <div className="space-y-3">
      {approved.length > 0 || uploading.length > 0 ? (
        <ProofSection
          icon={<Film className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />}
          title={approved.length > 0 ? "Approved work" : "Proof of work"}
          count={approved.length}
        >
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
          {approved.map((video, i) => (
            <VideoRow
              key={video.id}
              video={video}
              tag="approved"
              onPlay={() => setPlaying({ list: "approved", index: i })}
            />
          ))}
        </ProofSection>
      ) : null}

      {history.length > 0 ? (
        <ProofSection
          icon={<History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />}
          title="History"
          count={history.length}
        >
          {history.map((video, i) => (
            <VideoRow
              key={video.id}
              video={video}
              tag="rejected"
              onPlay={() => setPlaying({ list: "history", index: i })}
            />
          ))}
        </ProofSection>
      ) : null}

      {playingVideo && playing ? (
        <VideoPlayer
          videos={playingList}
          index={playing.index}
          label={playing.list === "history" ? "History" : "Approved work"}
          onClose={() => setPlaying(null)}
          onIndex={(i) => setPlaying({ list: playing.list, index: i })}
        />
      ) : null}
    </div>
  );
}
