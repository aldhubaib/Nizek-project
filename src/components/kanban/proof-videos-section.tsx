"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Film, History } from "lucide-react";
import { getTaskProofVideos, type TaskProofVideo } from "@/actions/proof-of-work";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ProofVideoPlayer,
  ProofVideoRow,
} from "@/components/proof/proof-video-list";
import { useProofOutbox } from "@/lib/proof-outbox";

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
            <ProofVideoRow
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
            <ProofVideoRow
              key={video.id}
              video={video}
              tag="rejected"
              onPlay={() => setPlaying({ list: "history", index: i })}
            />
          ))}
        </ProofSection>
      ) : null}

      {playingVideo && playing ? (
        <ProofVideoPlayer
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
