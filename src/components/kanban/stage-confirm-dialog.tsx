"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Stage } from "@/store/kanban";

interface CheckpointConfig {
  title: string;
  message: string;
  notice?: string;
  confirmLabel: string;
  confirmColor: string;
  requiresEstimate?: boolean;
}

const CHECKPOINTS: Partial<Record<string, CheckpointConfig>> = {
  "CLARIFICATION→READY_FOR_DEV": {
    title: "Move to Ready for Dev",
    message: "By confirming, you acknowledge that you understand the requirements and are taking ownership of this task.",
    notice: "The task timer will start once you confirm.",
    confirmLabel: "I Understand",
    confirmColor: "bg-blue-600 hover:bg-blue-700",
    requiresEstimate: true,
  },
  "INTERNAL_REVIEW→CLIENT_REVIEW": {
    title: "Move to Client Review",
    message: "By moving this to client review, you confirm that you have tested this task and it is working correctly.",
    confirmLabel: "Confirm Tested",
    confirmColor: "bg-amber-600 hover:bg-amber-700",
  },
  "INTERNAL_REVIEW→READY_FOR_RELEASE": {
    title: "Skip Client Review",
    message: "You are skipping the client approval for this task. By confirming, you acknowledge that you will be held responsible for this action and verify the task is tested and ready for release.",
    notice: "This action bypasses the client review process.",
    confirmLabel: "I Accept Responsibility & Skip",
    confirmColor: "bg-amber-600 hover:bg-amber-700",
  },
  "CLIENT_REVIEW→READY_FOR_RELEASE": {
    title: "Move to Ready for Release",
    message: "By moving this to Ready for Release, you confirm that you have reviewed and approved the work.",
    confirmLabel: "Approve",
    confirmColor: "bg-emerald-600 hover:bg-emerald-700",
  },
};

export function getCheckpoint(fromStage: Stage, toStage: Stage): CheckpointConfig | null {
  return CHECKPOINTS[`${fromStage}→${toStage}`] ?? null;
}

interface Props {
  checkpoint: CheckpointConfig;
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

export function StageConfirmDialog({ checkpoint, onConfirm, onCancel }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(0);
  const [estimateError, setEstimateError] = useState(false);

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
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-3">
          {checkpoint.title}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
          {checkpoint.message}
        </p>

        {checkpoint.requiresEstimate && (
          <div className="mb-4">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Estimated Time
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setSelectedMinutes(p.minutes); setEstimateError(false); }}
                  className={`h-7 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                    selectedMinutes === p.minutes
                      ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {estimateError && (
              <p className="text-[11px] text-destructive mt-1.5 font-medium">
                Please select an estimated time before proceeding.
              </p>
            )}
          </div>
        )}

        {checkpoint.notice && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-6">
            <span className="text-amber-400 text-[13px]">⏱</span>
            <p className="text-[12px] text-amber-400/90 font-medium">{checkpoint.notice}</p>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors disabled:opacity-50 ${checkpoint.confirmColor}`}
          >
            {confirming ? "Moving..." : checkpoint.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
