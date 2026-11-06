"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { rejectProofBypass } from "@/actions/proof-bypass-decide";
import { uploadProofForRequest, type ProofVideoInput } from "@/actions/proof-of-work";
import { ActivityCard } from "@/components/messages/activity-card";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import { UploadVideosDialog } from "@/components/proof/upload-videos-dialog";
import {
  proofBypassTaskUrl,
  type ProofBypassPayload,
} from "@/lib/proof-bypass-payload";
import { taskCode } from "@/lib/task-label";
import { cn } from "@/lib/utils";

const THEME = {
  accent: "text-success",
  border: "border-success/35",
  ring: "ring-success/20",
  iconWrap: "bg-success/10 text-success",
  button: "border-success/30 bg-success/5 hover:bg-success/10 text-success",
  quote: "border-success/60",
};

function category(status: ProofBypassPayload["status"]) {
  if (status === "APPROVED") return "Video uploaded";
  if (status === "REJECTED") return "Request declined";
  return "Video request";
}

function excerpt(payload: ProofBypassPayload, status: ProofBypassPayload["status"]) {
  if (status === "APPROVED") {
    return `${payload.decidedByName ?? "Someone"} uploaded the proof video. The task moved to Internal Review.`;
  }
  if (status === "REJECTED") {
    return `${payload.decidedByName ?? "Someone"} declined. Upload the video yourself to move the task.`;
  }
  return `${payload.requesterName} asks you to upload the proof video for this task.`;
}

export function ProofBypassCard({
  payload,
  createdAt,
  currentUserId,
}: {
  payload: ProofBypassPayload;
  createdAt: string;
  currentUserId: string;
}) {
  const [status, setStatus] = useState(payload.status);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const canDecide = status === "PENDING" && payload.requesterId !== currentUserId;
  const href = proofBypassTaskUrl(payload);
  const title = `${taskCode(payload.taskType, payload.taskNumber)} ${payload.taskTitle}`;

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      await rejectProofBypass(payload.passId);
      setStatus("REJECTED");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /minified react error|server components render|#441/i.test(raw)
          ? "Could not update this request. Try again."
          : raw || "Could not update request",
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload(videos: ProofVideoInput[]) {
    const result = await uploadProofForRequest({ passId: payload.passId, videos });
    if (!result.success) return result.error;
    setStatus("APPROVED");
    return null;
  }

  return (
    <>
      <ActivityCard
        theme={THEME}
        icon={Film}
        category={category(status)}
        title={title}
        projectName={payload.projectName}
        createdAt={createdAt}
        actionLabel="Open task"
        onAction={() => setPanelOpen(true)}
      >
        <blockquote className={cn("border-s-2 ps-3 text-s italic text-muted-foreground", THEME.quote)}>
          {excerpt(payload, status)}
        </blockquote>
        {canDecide ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void decline()}
              className="flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-s font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setUploading(true)}
              className={cn(
                "flex items-center justify-center rounded-lg border px-3 py-2.5 text-s font-medium text-foreground transition-colors disabled:opacity-50",
                THEME.button,
              )}
            >
              Upload video
            </button>
          </div>
        ) : null}
        {error ? <p className="text-s text-destructive">{error}</p> : null}
      </ActivityCard>
      {uploading ? (
        <UploadVideosDialog
          title="Upload for someone else"
          description={`Upload the proof video for ${title} on behalf of ${payload.requesterName}. The task moves to Internal Review once it is up.`}
          submitLabel="Upload & move"
          onSubmit={upload}
          onClose={() => setUploading(false)}
        />
      ) : null}
      {panelOpen ? (
        <TaskInboxSlideOver
          taskId={payload.taskId}
          href={href}
          title={payload.taskTitle}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}
