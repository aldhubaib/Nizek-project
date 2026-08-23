"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Bug, Clock, Palette, Sparkles, UserRound, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { isMissingDataTask } from "@/lib/task-readiness";
import { taskStageBadge } from "@/lib/task-label";
import { cn } from "@/lib/utils";

export function getTypeIcon(taskType: string) {
  switch (taskType) {
    case "ENHANCEMENT":
      return { icon: Wrench, color: "text-violet" };
    case "BUG":
      return { icon: Bug, color: "text-destructive" };
    case "REPORTED_BUG":
      return { icon: AlertCircle, color: "text-destructive" };
    case "DESIGN":
      return { icon: Palette, color: "text-cyan" };
    default:
      return { icon: Sparkles, color: "text-primary" };
  }
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function EmptyAssigneeIcon({ className }: { className?: string }) {
  return (
    <span
      title="Unassigned"
      aria-label="Unassigned"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border border-muted-foreground/70 text-muted-foreground",
        className,
      )}
    >
      <UserRound className="size-3" />
    </span>
  );
}

export function TaskTypeBadge({ taskType }: { taskType: string }) {
  const cfg = getTypeIcon(taskType);
  const Icon = cfg.icon;
  return <Icon className={`size-4 shrink-0 ${cfg.color}`} />;
}

export function TaskTypeCountSummary({
  tasks,
}: {
  tasks: { taskType: string }[];
}) {
  if (tasks.length === 0) return null;

  const typeCounts: Record<string, number> = {};
  for (const task of tasks) {
    typeCounts[task.taskType] = (typeCounts[task.taskType] ?? 0) + 1;
  }

  return (
    <div className="flex items-center gap-2">
      {Object.entries(typeCounts).map(([type, count]) => {
        const cfg = getTypeIcon(type);
        const Icon = cfg.icon;
        return (
          <span key={type} className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
            <Icon className="size-3.5" />
            <span className="text-muted-foreground">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export interface SprintTaskRowData {
  title: string;
  taskType: string;
  stage: string;
  assignee?: { name: string | null; imageUrl: string | null } | null;
  isReadyForTransition?: boolean;
  sprintCount?: number;
}

interface SprintTaskRowProps extends HTMLAttributes<HTMLElement> {
  task: SprintTaskRowData;
  extra?: ReactNode;
  assigneeSlot?: ReactNode;
  footer?: ReactNode;
  as?: "button" | "div";
  missingData?: boolean;
  hideStatus?: boolean;
  disableHoverBorder?: boolean;
}

export const SprintTaskRow = forwardRef<HTMLElement, SprintTaskRowProps>(
  function SprintTaskRow(
    { task, extra, assigneeSlot, footer, as = "button", missingData, hideStatus, disableHoverBorder, className, ...props },
    ref,
  ) {
    const initials =
      task.assignee?.name?.split(" ").map((n) => n[0]).join("") ?? "?";
    const Comp = as === "div" ? "div" : "button";
    const showMissing = missingData ?? isMissingDataTask(task);

    const row = (
      <>
        <TaskTypeBadge taskType={task.taskType} />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-s" title={task.title}>
            {task.title.split(/\s+/).length > 15
              ? task.title.split(/\s+/).slice(0, 15).join(" ") + "…"
              : task.title}
          </span>
          {(task.sprintCount ?? 0) >= 2 && (
            <span
              title={`In ${task.sprintCount} sprints`}
              className="inline-flex shrink-0 items-center rounded-lg border border-border px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
            >
              {task.sprintCount}x
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          {!hideStatus && <StatusBadge config={taskStageBadge(task.stage, showMissing)} />}
          {assigneeSlot ?? (
            task.assignee ? (
              task.assignee.imageUrl ? (
                <img
                  src={task.assignee.imageUrl}
                  alt={task.assignee.name ?? ""}
                  className="block size-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {initials}
                </span>
              )
            ) : (
              <EmptyAssigneeIcon />
            )
          )}
        </div>
      </>
    );

    return (
      <Comp
        ref={ref as never}
        {...(as === "button" ? { type: "button" as const } : {})}
        className={cn(
          "flex min-h-16 w-full rounded-md border border-border bg-field px-3 py-4 text-start",
          footer ? "flex-col items-stretch gap-3" : "items-center gap-3",
          !disableHoverBorder && "hover:border-foreground/40",
          className,
        )}
        {...props}
      >
        {footer ? <div className="flex w-full items-center gap-3">{row}</div> : row}
        {footer}
      </Comp>
    );
  },
);

export function EstimateBadge({ minutes }: { minutes: number | null | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums",
        minutes
          ? "border-success/30 text-success"
          : "border-dashed border-muted-foreground/40 text-muted-foreground/50",
      )}
    >
      <Clock className="size-3.5" />
      {minutes ? formatMinutes(minutes) : "Est"}
    </span>
  );
}
