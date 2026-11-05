"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";

import { taskCode } from "@/lib/task-label";
import { isMissingDataTask } from "@/lib/task-readiness";
import { useOpen } from "@/next-ui/blocks";
import { cn } from "@/next-ui/lib/cn";
import { childId, hrefFromEntry, PaneContextMenu } from "@/next-ui/panes";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { formatMinutes, type LaneTask } from "./board-state";
import { LaneDot, PriorityMark, TaskTypeIcon } from "./task-marks";

/**
 * The board layout the road map and the active sprint share. Narrow panes stack the lanes;
 * from `@3xl` (the pane's own width, not the window's) they stand side by side and the board
 * scrolls sideways. A lane is a titled column: dot, name, count, an optional action, then its
 * cards or an empty line.
 */
export function LaneBoard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 @3xl:flex-row @3xl:items-start @3xl:gap-3 @3xl:overflow-x-auto @3xl:pb-2",
        className,
      )}
      data-testid="lane-board"
    >
      {children}
    </div>
  );
}

export function Lane({
  title,
  status,
  count,
  action,
  empty,
  children,
  className,
}: {
  title: string;
  status: string;
  count: number;
  action?: React.ReactNode;
  empty: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2 @3xl:w-72 @3xl:shrink-0", className)} aria-label={title} data-testid="lane">
      <header className="flex h-8 items-center gap-2 px-1">
        <LaneDot status={status} />
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        {action && <span className="ms-auto flex items-center">{action}</span>}
      </header>
      <div className="flex min-h-16 flex-col gap-2 rounded-xl border bg-muted/20 p-2">
        {count === 0 && !children ? (
          <p className="px-2 py-5 text-center text-xs text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function LaneSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 @3xl:w-72 @3xl:shrink-0" aria-hidden>
      <header className="flex h-8 items-center gap-2 px-1">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </header>
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

/**
 * One task as a card in a lane: its key (F-012) over the type icon and title, the priority
 * glyph on the right, and when it applies the "in N sprints" count, the missing-data flag,
 * the estimate and the assignee. Click opens the task beside this pane.
 */
export function TaskCard({
  task,
  projectId,
  showAssignee,
  showEstimate,
  muted,
  className,
}: {
  task: LaneTask;
  projectId: string;
  showAssignee?: boolean;
  showEstimate?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const href = hrefFromEntry({ kind: "task", id: childId(projectId, task.id) });
  const open = useOpen({ href });
  const missing = isMissingDataTask(task);
  const initials = task.assignee?.name?.trim().charAt(0).toUpperCase();
  const card = (
    <div
      role="button"
      tabIndex={0}
      onClick={open.onClick}
      onKeyDown={open.onKeyDown}
      data-href={href}
      data-testid="task-card"
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        muted && "opacity-70",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] leading-none text-muted-foreground/70">{taskCode(task.taskType, task.taskNumber)}</span>
        {(task.sprintCount ?? 0) >= 2 && (
          <span
            title={`In ${task.sprintCount} sprints`}
            className="rounded-md border px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground"
          >
            {`${task.sprintCount}x`}
          </span>
        )}
        {(task.declineCount ?? 0) > 0 && (
          <span title={`Declined ${task.declineCount} time${task.declineCount === 1 ? "" : "s"}`} className="text-[10px] font-semibold text-orange">
            {`↩ ${task.declineCount}`}
          </span>
        )}
        <span className="ms-auto flex items-center gap-1">
          {missing && (
            <span title="Missing data" aria-label="Missing data" className="grid size-5 place-items-center text-amber-400">
              <CircleAlert className="size-4" />
            </span>
          )}
          <PriorityMark priority={task.priority} />
        </span>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <TaskTypeIcon taskType={task.taskType} className="mt-0.5" />
        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug" title={task.title}>
          {task.title}
        </span>
      </div>
      {(showAssignee || (showEstimate && task.estimatedMinutes)) && (
        <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          {showEstimate && task.estimatedMinutes ? <span className="tabular-nums">{formatMinutes(task.estimatedMinutes)}</span> : null}
          {showAssignee && (
            <span className="ms-auto flex items-center gap-1.5">
              {task.assignee ? (
                <>
                  <Avatar className="size-5">
                    {task.assignee.imageUrl && <AvatarImage src={task.assignee.imageUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">{initials || "?"}</AvatarFallback>
                  </Avatar>
                  <span className="max-w-28 truncate">{task.assignee.name ?? "Unnamed"}</span>
                </>
              ) : (
                <span className="text-muted-foreground/70">Unassigned</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
  return <PaneContextMenu href={href}>{card}</PaneContextMenu>;
}
