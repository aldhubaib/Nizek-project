"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, UserCheck, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Stage } from "@/store/kanban";

interface CheckpointConfig {
  title: string;
  message: string;
  notice?: string;
  confirmLabel: string;
  confirmColor: string;
  requiresEstimate?: boolean;
  /** Render the "taking ownership" hand-off chips (current assignee → me). */
  assignToMe?: boolean;
}

const CHECKPOINTS: Partial<Record<string, CheckpointConfig>> = {
  "CLARIFICATION→READY_FOR_DEV": {
    title: "Taking ownership",
    message: "By confirming, you acknowledge that you understand the requirements and are taking ownership of this task.",
    notice: "The task timer will start once you confirm.",
    confirmLabel: "I Understand",
    confirmColor: "bg-primary hover:bg-primary/90",
    requiresEstimate: true,
    assignToMe: true,
  },
  "INTERNAL_REVIEW→CLIENT_REVIEW": {
    title: "Move to Client Review",
    message: "By moving this to client review, you confirm that you have tested this task and it is working correctly.",
    confirmLabel: "Confirm Tested",
    confirmColor: "bg-orange hover:bg-orange/80",
  },
  "INTERNAL_REVIEW→READY_FOR_RELEASE": {
    title: "Skip Client Review",
    message: "You are skipping the client approval for this task. By confirming, you acknowledge that you will be held responsible for this action and verify the task is tested and ready for release.",
    notice: "This action bypasses the client review process.",
    confirmLabel: "I Accept Responsibility & Skip",
    confirmColor: "bg-orange hover:bg-orange/80",
  },
  "CLIENT_REVIEW→READY_FOR_RELEASE": {
    title: "Move to Ready for Release",
    message: "By moving this to Ready for Release, you confirm that you have reviewed and approved the work.",
    confirmLabel: "Approve",
    confirmColor: "bg-success hover:bg-success/80",
  },
};

export function getCheckpoint(fromStage: Stage, toStage: Stage): CheckpointConfig | null {
  return CHECKPOINTS[`${fromStage}→${toStage}`] ?? null;
}

interface Props {
  checkpoint: CheckpointConfig;
  currentAssigneeName?: string | null;
  currentAssigneeAvatar?: string | null;
  onConfirm: (estimatedMinutes?: number) => void;
  onCancel: () => void;
}

const PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "1d", minutes: 480 },
  { label: "2d", minutes: 960 },
];

export function StageConfirmDialog({
  checkpoint,
  currentAssigneeName,
  currentAssigneeAvatar,
  onConfirm,
  onCancel,
}: Props) {
  const { user } = useUser();
  const [confirming, setConfirming] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(0);
  const [estimateError, setEstimateError] = useState(false);

  const me = user?.fullName || user?.firstName || "You";
  const meAvatar = user?.imageUrl || null;

  function handleConfirm() {
    if (checkpoint.requiresEstimate) {
      if (selectedMinutes <= 0) {
        setEstimateError(true);
        return;
      }
      setConfirming(true);
      onConfirm(selectedMinutes);
    } else {
      setConfirming(true);
      onConfirm();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              checkpoint.assignToMe
                ? "bg-primary/15 text-primary"
                : "bg-orange/15 text-orange"
            }`}
          >
            {checkpoint.assignToMe ? (
              <UserCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>

          {checkpoint.assignToMe ? (
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {checkpoint.title}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-s">
                {currentAssigneeName ? (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-xs rounded-full bg-muted/60 py-0.5 ps-0.5 pe-2.5 text-muted-foreground">
                    <Avatar className="size-5">
                      {currentAssigneeAvatar && (
                        <AvatarImage src={currentAssigneeAvatar} alt={currentAssigneeName} />
                      )}
                      <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                        {currentAssigneeName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{currentAssigneeName}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-xs rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
                    Unassigned
                  </span>
                )}
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="inline-flex min-w-0 max-w-full items-center gap-xs rounded-full bg-primary/15 py-0.5 ps-0.5 pe-2.5 font-medium text-primary">
                  <Avatar className="size-5">
                    {meAvatar && <AvatarImage src={meAvatar} alt={me} />}
                    <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                      {me.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{me}</span>
                </span>
              </div>
              <p className="text-s leading-relaxed text-muted-foreground">
                {checkpoint.message}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {checkpoint.title}
              </div>
              <p className="text-s leading-relaxed text-muted-foreground">
                {checkpoint.message}
              </p>
            </div>
          )}
        </div>

        {checkpoint.requiresEstimate && (
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Estimated Time
            </label>
            <div className="flex flex-wrap gap-xs">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setSelectedMinutes(p.minutes); setEstimateError(false); }}
                  className={`h-7 rounded-md border px-2.5 text-s font-medium transition-colors ${
                    selectedMinutes === p.minutes
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {estimateError && (
              <p className="text-xs text-destructive mt-1.5 font-medium">
                Please select an estimated time before proceeding.
              </p>
            )}
          </div>
        )}

        {checkpoint.notice && (
          <div className="flex items-center gap-2 rounded-lg border border-orange/30 bg-orange/10 px-3 py-2 mt-4">
            <span className="text-orange text-s">⏱</span>
            <p className="text-s text-orange/90 font-medium">{checkpoint.notice}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-s font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={`px-4 py-2 rounded-lg text-s font-medium text-white transition-colors disabled:opacity-50 ${checkpoint.confirmColor}`}
          >
            {confirming ? "Moving..." : checkpoint.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
