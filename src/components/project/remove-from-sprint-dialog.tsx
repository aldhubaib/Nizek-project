"use client";

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
}

interface Props {
  open: boolean;
  projectId: string;
  task: TaskPreview | null;
  /** The sprint the task is leaving. */
  fromSprintName: string;
  /** Where it is going: "Backlog", "Planned", or a sprint name. */
  toLabel: string;
  /**
   * Only the fields this particular move actually discards. Leaving for another
   * sprint keeps the estimate and assignee but not the Decision and Risk, which
   * were agreed for the sprint being left.
   */
  clearedFields: string[];
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function listFields(fields: string[]): string {
  if (fields.length === 1) return fields[0];
  return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`;
}

export function RemoveFromSprintDialog({
  open,
  projectId,
  task,
  fromSprintName,
  toLabel,
  clearedFields,
  pending,
  onOpenChange,
  onConfirm,
}: Props) {
  if (!open || !task || clearedFields.length === 0) return null;

  const stage = taskStageBadge(task.stage);
  const plural = clearedFields.length > 1;

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
                  Move out of {fromSprintName}
                </div>
                <p className="text-s leading-relaxed break-words text-muted-foreground">
                  Moving this task to{" "}
                  <span className="font-medium text-foreground">{toLabel}</span> will clear its{" "}
                  <span className="font-medium text-foreground">{listFields(clearedFields)}</span>.
                  {plural ? " They" : " It"} cannot be recovered, and{" "}
                  {plural ? "they" : "it"} will have to be filled in again if the task comes back.
                  Are you sure?
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
            <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
              Move and clear
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
