"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { CircleAlert, Clock, UserRound } from "lucide-react";
import { PriorityIconBadge } from "@/components/task/priority-icon";
import { isMissingDataTask } from "@/lib/task-readiness";
import { taskCode, type TaskPriorityId } from "@/lib/task-label";
import { taskTypeStyle } from "@/lib/task-type-style";
import { cn } from "@/lib/utils";

export function getTypeIcon(taskType: string) {
  const style = taskTypeStyle(taskType);
  return { icon: style.icon, color: style.text };
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
  /**
   * Drives the issue key in the card's top-left corner. Optional because the
   * sprint-doc rows carry no number; those keep the single-line card they had.
   */
  taskNumber?: number;
  /** Absent on the sprint-doc rows, which carry no priority and hide the slot. */
  priority?: TaskPriorityId;
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
  hidePriority?: boolean;
  hideAssignee?: boolean;
  disableHoverBorder?: boolean;
  incomplete?: boolean;
  incompleteReason?: string | null;
  /** Backlog keeps estimate / assignee. Roadmap shows status on the right. */
  variant?: "backlog" | "roadmap";
}

export const SprintTaskRow = forwardRef<HTMLElement, SprintTaskRowProps>(
  function SprintTaskRow(
    {
      task,
      extra,
      assigneeSlot,
      footer,
      as = "button",
      missingData,
      hidePriority,
      hideAssignee,
      disableHoverBorder,
      incomplete,
      incompleteReason,
      variant = "backlog",
      className,
      ...props
    },
    ref,
  ) {
    const initials =
      task.assignee?.name?.split(" ").map((n) => n[0]).join("") ?? "?";
    const Comp = as === "div" ? "div" : "button";
    const showMissing = missingData ?? isMissingDataTask(task);
    const compact = variant === "roadmap";
    const showPriority = !hidePriority && task.priority != null;
    const showFlag = !hidePriority && showMissing;
    const showAssignee = !compact && !hideAssignee;
    const showExtra = !compact && extra;

    const row = (
      <>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <TaskTypeBadge taskType={task.taskType} />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate text-s" title={task.title}>
              {task.title.split(/\s+/).length > 15
                ? task.title.split(/\s+/).slice(0, 15).join(" ") + "…"
                : task.title}
            </span>
            {!compact && (task.sprintCount ?? 0) >= 2 && (
              <span
                title={`In ${task.sprintCount} sprints`}
                className="inline-flex shrink-0 items-center rounded-lg border border-border px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
              >
                {task.sprintCount}x
              </span>
            )}
          </span>
        </span>
        {(showExtra || showPriority || showAssignee || incomplete || showFlag) && (
          <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:pl-7">
            {showExtra ? extra : null}
            {incomplete ? (
              <span
                title={incompleteReason?.trim() || "Incomplete"}
                className="grid size-6 shrink-0 place-items-center text-orange"
              >
                <CircleAlert className="size-4" />
              </span>
            ) : null}
            {/* Missing data used to ride along inside the stage badge, which
                priority replaced. It stays as its own glyph so dropping the
                badge does not drop the warning with it. */}
            {showFlag && !incomplete && (
              <span
                title="Missing data"
                aria-label="Missing data"
                className="grid size-6 shrink-0 place-items-center text-orange"
              >
                <CircleAlert className="size-4" />
              </span>
            )}
            {/* Shown alongside a warning rather than instead of it: one says the
                task needs attention, the other says how much it matters. */}
            {showPriority && task.priority && (
              <PriorityIconBadge priority={task.priority} />
            )}
            {showAssignee && (assigneeSlot ?? (
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
            ))}
          </div>
        )}
      </>
    );

    const code =
      task.taskNumber == null ? null : (
        <span className="font-mono text-xs leading-none text-muted-foreground/60">
          {taskCode(task.taskType, task.taskNumber)}
        </span>
      );

    const rowWrapper = (
      <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        {row}
      </div>
    );

    return (
      <Comp
        ref={ref as never}
        {...(as === "button" ? { type: "button" as const } : {})}
        className={cn(
          "flex w-full rounded-md border border-border bg-field px-3 text-start",
          compact ? "min-h-12 py-3" : "min-h-16 py-4",
          // A key or a footer both turn the card into stacked lines. Without
          // either it stays the single centred row it has always been.
          footer || code
            ? "flex-col items-stretch gap-3"
            : "flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3",
          !disableHoverBorder && "hover:border-foreground/40",
          className,
        )}
        {...props}
      >
        {code ? (
          // Tighter than the card's own gap: the key labels the row beneath it
          // rather than standing as a line of its own.
          <div className="flex w-full flex-col items-stretch gap-1.5">
            {code}
            {rowWrapper}
          </div>
        ) : footer ? (
          rowWrapper
        ) : (
          row
        )}
        {footer}
      </Comp>
    );
  },
);

/** Road map list row — type icon, name, and priority. */
export const RoadmapTaskRow = forwardRef<HTMLElement, Omit<SprintTaskRowProps, "variant">>(
  function RoadmapTaskRow(props, ref) {
    return <SprintTaskRow ref={ref} variant="roadmap" {...props} />;
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
