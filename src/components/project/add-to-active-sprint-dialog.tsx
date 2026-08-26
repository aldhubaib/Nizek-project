"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { taskCode, taskStageBadge } from "@/lib/task-label";

interface TaskPreview {
  id: string;
  title: string;
  taskType: string;
  taskNumber: number;
  stage: string;
  estimatedMinutes?: number | null;
}

interface Props {
  open: boolean;
  projectId: string;
  sprintName: string;
  task: TaskPreview | null;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (estimatedMinutes: number) => void;
}

export function AddToActiveSprintDialog({
  open,
  projectId,
  sprintName,
  task,
  pending,
  onOpenChange,
  onConfirm,
}: Props) {
  const [estimate, setEstimate] = useState("");

  useEffect(() => {
    if (!open) {
      setEstimate("");
      return;
    }
    const existing = task?.estimatedMinutes;
    setEstimate(existing != null && existing > 0 ? String(existing) : "");
  }, [open, task?.id, task?.estimatedMinutes]);

  if (!open || !task) return null;

  const stage = taskStageBadge(task.stage);
  const currentEstimate = estimate ? parseInt(estimate, 10) : null;
  const hasValidEstimate = currentEstimate != null && !isNaN(currentEstimate) && currentEstimate > 0;

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-overlay backdrop-blur-sm"
        onClick={() => !pending && onOpenChange(false)}
      />
      <div className="fixed top-1/2 left-1/2 z-[901] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-2xl">
          <div className="px-5 pt-5 pb-4">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Add to active sprint
                </div>
                <p className="text-s leading-relaxed break-words text-muted-foreground">
                  You are trying to add a task to{" "}
                  <span className="font-medium text-foreground">{sprintName}</span>, which is
                  already active. Are you sure?
                </p>
              </div>
            </div>

            <Link
              href={`/dashboard/projects/${projectId}/tasks/${task.id}`}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-start hover:border-foreground/40"
            >
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                {taskCode(task.taskType, task.taskNumber)}
              </span>
              <span className="min-w-0 flex-1 truncate text-s">{task.title}</span>
              <StatusBadge config={stage} />
            </Link>

            <div className="mt-4 space-y-2">
              <label className="text-s font-medium text-foreground">
                Estimation in minutes <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  name={`sprint-estimate-${task.id}`}
                  autoComplete="off"
                  inputMode="numeric"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hasValidEstimate) {
                      e.preventDefault();
                      onConfirm(currentEstimate!);
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
                All tasks in an active sprint must have an estimation.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => hasValidEstimate && onConfirm(currentEstimate!)}
              disabled={pending || !hasValidEstimate}
            >
              Add to sprint
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
