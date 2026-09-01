"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrentUser } from "@/components/current-user-provider";
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

// Done is the end of the work a person does on a task. What follows — the sprint
// completing, and the client optionally accepting it — happens at sprint level,
// so there is no per-task client approval step to warn about any more.
const CHECKPOINTS: Partial<Record<string, CheckpointConfig>> = {
  "INTERNAL_REVIEW→DONE": {
    title: "Move to Done",
    message: "By moving this to Done, you confirm that you have reviewed the work and it is ready to ship with the sprint.",
    confirmLabel: "Approve",
    confirmColor: "bg-success hover:bg-success/80",
  },
};

export function getCheckpoint(
  fromStage: Stage,
  toStage: Stage,
  opts?: { missingEstimate?: boolean },
): CheckpointConfig | null {
  const enteringDev = fromStage !== "IN_DEVELOPMENT" && toStage === "IN_DEVELOPMENT";
  if (enteringDev && opts?.missingEstimate) {
    return {
      title: "Estimation required",
      message: "Enter an estimation before moving this task to In Development.",
      confirmLabel: "Start development",
      confirmColor: "bg-primary hover:bg-primary/90",
      requiresEstimate: true,
    };
  }
  return CHECKPOINTS[`${fromStage}→${toStage}`] ?? null;
}

interface Props {
  checkpoint: CheckpointConfig;
  currentAssigneeName?: string | null;
  currentAssigneeAvatar?: string | null;
  onConfirm: (estimatedMinutes?: number) => void;
  onCancel: () => void;
}

export function StageConfirmDialog({
  checkpoint,
  currentAssigneeName,
  currentAssigneeAvatar,
  onConfirm,
  onCancel,
}: Props) {
  const user = useCurrentUser();
  const [confirming, setConfirming] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [estimateError, setEstimateError] = useState(false);

  useEffect(() => {
    setEstimate("");
    setEstimateError(false);
  }, [checkpoint.title]);

  const currentEstimate = estimate ? parseInt(estimate, 10) : null;
  const hasValidEstimate =
    currentEstimate != null && !isNaN(currentEstimate) && currentEstimate > 0;

  const me = user?.name || "You";
  const meAvatar = user?.imageUrl || null;

  function handleConfirm() {
    if (checkpoint.requiresEstimate) {
      if (!hasValidEstimate) {
        setEstimateError(true);
        return;
      }
      setConfirming(true);
      onConfirm(currentEstimate!);
    } else {
      setConfirming(true);
      onConfirm();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onCancel} />
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
                    <Avatar size="xs">
                      {currentAssigneeAvatar && (
                        <AvatarImage src={currentAssigneeAvatar} alt={currentAssigneeName} />
                      )}
                      <AvatarFallback className="bg-muted font-semibold text-muted-foreground">
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
                  <Avatar size="xs">
                    {meAvatar && <AvatarImage src={meAvatar} alt={me} />}
                    <AvatarFallback className="bg-primary font-bold text-primary-foreground">
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
          <div className="mt-4 space-y-2">
            <label className="text-s font-medium text-foreground">
              Estimation in minutes <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                autoComplete="off"
                inputMode="numeric"
                value={estimate}
                onChange={(e) => {
                  setEstimate(e.target.value);
                  setEstimateError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder="e.g. 120"
                autoFocus
                className="w-full rounded-lg border border-primary/40 bg-background py-2.5 pl-3 pr-10 text-s text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                min
              </span>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Required before work starts in In Development.
            </p>
            {estimateError && (
              <p className="text-xs font-medium text-destructive">
                Enter an estimation in minutes.
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
