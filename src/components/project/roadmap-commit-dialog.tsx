"use client";

import { createPortal } from "react-dom";
import { ShieldAlert } from "lucide-react";

export function RoadmapWarningDialog({
  heading,
  message,
  notice,
  onDismiss,
}: {
  heading: string;
  message: string;
  notice?: string;
  onDismiss: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {heading}
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{message}</p>
          </div>
        </div>

        {notice ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mt-4">
            <span className="text-amber-400 text-[13px]">⏱</span>
            <p className="text-[12px] text-amber-400/90 font-medium">{notice}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-end mt-6">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors bg-blue-600 hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RoadmapCommitDialog({
  title,
  startDateLabel,
  dueDateLabel,
  confirming,
  onConfirm,
  onCancel,
}: {
  title: string;
  startDateLabel: string;
  dueDateLabel: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Commit to this item
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              By confirming, the team will be committed to do{" "}
              <span className="font-semibold text-foreground">“{title}”</span>.
              The starting date and due date will be set automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mt-4">
          <span className="text-amber-400 text-[13px]">⏱</span>
          <p className="text-[12px] text-amber-400/90 font-medium">
            Starting date will be set to {startDateLabel}. You can adjust it afterwards.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mt-2">
          <span className="text-amber-400 text-[13px]">⏱</span>
          <p className="text-[12px] text-amber-400/90 font-medium">
            Due date will be set to {dueDateLabel}. You can adjust it afterwards.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
          >
            {confirming ? "Moving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
