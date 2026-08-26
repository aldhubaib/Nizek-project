"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import {
  approveProofBypass,
  rejectProofBypass,
} from "@/actions/proof-bypass-decide";
import { ActivityCard } from "@/components/messages/activity-card";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
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
  if (status === "APPROVED") return "Bypass approved";
  if (status === "REJECTED") return "Bypass rejected";
  return "Video bypass";
}

function excerpt(payload: ProofBypassPayload, status: ProofBypassPayload["status"]) {
  if (status === "APPROVED") {
    return `${payload.decidedByName ?? "Someone"} approved the bypass. The task moved to Internal Review.`;
  }
  if (status === "REJECTED") {
    return `${payload.decidedByName ?? "Someone"} rejected the bypass. Upload videos to move the task.`;
  }
  return `${payload.requesterName} wants to skip proof-of-work videos.`;
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
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const canDecide = status === "PENDING" && payload.requesterId !== currentUserId;
  const href = proofBypassTaskUrl(payload);
  const title = `${taskCode(payload.taskType, payload.taskNumber)} ${payload.taskTitle}`;

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      if (action === "approve") await approveProofBypass(payload.passId);
      else await rejectProofBypass(payload.passId);
      setStatus(action === "approve" ? "APPROVED" : "REJECTED");
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

  return (
    <>
      <ActivityCard
        theme={THEME}
        icon={Film}
        category={category(status)}
        title={title}
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
              onClick={() => void decide("reject")}
              className="flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-s font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("approve")}
              className={cn(
                "flex items-center justify-center rounded-lg border px-3 py-2.5 text-s font-medium text-foreground transition-colors disabled:opacity-50",
                THEME.button,
              )}
            >
              Approve
            </button>
          </div>
        ) : null}
        {error ? <p className="text-s text-destructive">{error}</p> : null}
      </ActivityCard>
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
