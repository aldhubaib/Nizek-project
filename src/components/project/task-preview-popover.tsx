"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckSquare, Loader2, X } from "lucide-react";
import { getTaskPreview, type TaskPreview } from "@/actions/task";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { taskCode, taskStageBadge, stageLabel, taskTypeLabel, TASK_STAGE_DOT } from "@/lib/task-label";
import { StatusBadge } from "@/components/ui/status-badge";

export type TaskPreviewSeed = {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage?: string;
};

export function TaskPreviewPopover({
  taskId,
  href,
  seed,
  onClose,
}: {
  taskId: string;
  href: string;
  seed?: TaskPreviewSeed | null;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<TaskPreview | null>(
    seed
      ? {
          id: seed.id,
          title: seed.title,
          taskNumber: seed.taskNumber,
          taskType: seed.taskType,
          stage: seed.stage ?? "",
          snippet: null,
          projectId: "",
          assigneeName: null,
          assigneeImageUrl: null,
        }
      : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTaskPreview(taskId)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load task");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const title = preview?.title ?? seed?.title ?? "Task";
  const type = preview?.taskType ?? seed?.taskType ?? "FEATURE";
  const number = preview?.taskNumber ?? seed?.taskNumber ?? 0;
  const stageText = preview?.stage ? stageLabel(preview.stage) : null;

  return (
    <div className="flex w-[min(calc(100vw-2rem),320px)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <CheckSquare className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {taskCode(type, number)} · {taskTypeLabel(type)}
          </p>
          <h3 className="mt-0.5 text-s font-semibold leading-snug text-foreground">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 px-3 py-3">
        {loading && !preview?.stage && !preview?.snippet ? (
          <div className="flex items-center gap-2 text-s text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading preview…
          </div>
        ) : error ? (
          <p className="text-s text-destructive">{error}</p>
        ) : (
          <>
            {(stageText || preview?.assigneeName) && (
              <div className="flex items-center gap-2">
                {stageText && preview?.stage && (
                  <StatusBadge
                    config={taskStageBadge(preview.stage)}
                    dot
                    dotColor={TASK_STAGE_DOT[preview.stage]}
                  />
                )}
                {preview?.assigneeName && (
                  <Avatar
                    size="sm"
                    className="ms-auto"
                    title={preview.assigneeName}
                  >
                    <AvatarImage src={preview.assigneeImageUrl ?? undefined} alt="" />
                    <AvatarFallback>
                      {preview.assigneeName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            )}
            {preview?.snippet ? (
              <p className="line-clamp-5 text-s leading-relaxed text-foreground/90">
                {preview.snippet}
              </p>
            ) : (
              <p className="text-s italic text-muted-foreground">No description yet.</p>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Link
          href={href}
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-s font-medium text-success transition-colors hover:bg-success/10"
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            Open original task
          </span>
          <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
