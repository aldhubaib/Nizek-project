"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Undo2, Loader2, AlertTriangle } from "lucide-react";
import type { Stage } from "@/store/kanban";

const STAGE_LABELS: Record<string, string> = {
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  IN_DEVELOPMENT: "In Development",
};

const DECLINE_TARGETS: Record<string, string> = {
  INTERNAL_REVIEW: "IN_DEVELOPMENT",
  CLIENT_REVIEW: "INTERNAL_REVIEW",
};

interface Props {
  fromStage: Stage;
  onConfirm: (comment: string) => Promise<void>;
  onCancel: () => void;
}

export function DeclineDialog({ fromStage, onConfirm, onCancel }: Props) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(comment.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[900]"
        onClick={onCancel}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[901] w-full max-w-md">
        <div className="rounded-xl border border-destructive/30 bg-card shadow-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold">Decline Task</h3>
                <p className="text-[12px] text-muted-foreground">
                  Return this task from {STAGE_LABELS[fromStage] ?? fromStage} back to {STAGE_LABELS[DECLINE_TARGETS[fromStage]] ?? "previous stage"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-foreground">
                Reason for declining <span className="text-destructive">*</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain what needs to be fixed or changed..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive/50 resize-none transition-colors"
                rows={4}
                autoFocus
              />
              {comment.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60">
                  A comment is required when declining a task
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmit}
              disabled={!comment.trim() || submitting}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Undo2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Decline &amp; Return
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
