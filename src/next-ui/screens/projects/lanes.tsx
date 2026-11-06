"use client";

import * as React from "react";
import { KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
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
 * scrolls sideways — by swipe or shift + wheel, with no scrollbar drawn under the lanes, the
 * same as the drawer's strip. A lane is a titled column: dot, name, count, an optional
 * action, then its cards or an empty line.
 */
export function LaneBoard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 @3xl:flex-row @3xl:items-start @3xl:gap-3 @3xl:overflow-x-auto",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
  dot,
  count,
  action,
  empty,
  children,
  className,
  bodyRef,
  bodyClassName,
  testId = "lane",
}: {
  title: string;
  /** The stage whose dot heads the lane (`LaneDot`); ignored when `dot` is given. */
  status: string;
  /** The dot's own colour class, for a lane that is not a task stage (a Kanban column). */
  dot?: string;
  count: number;
  action?: React.ReactNode;
  empty: string;
  children?: React.ReactNode;
  className?: string;
  /** The cards' box, for a drop zone. */
  bodyRef?: (el: HTMLDivElement | null) => void;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2 @3xl:w-72 @3xl:shrink-0", className)} aria-label={title} data-testid={testId}>
      <header className="flex h-8 items-center gap-2 px-1">
        {dot ? <i aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} /> : <LaneDot status={status} />}
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        {action && <span className="ms-auto flex items-center">{action}</span>}
      </header>
      <div ref={bodyRef} className={cn("flex min-h-16 flex-col gap-2 rounded-xl border bg-muted/20 p-2 transition-colors", bodyClassName)}>
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
 * the estimate and the assignee. Click opens the task beside this pane. A board that moves
 * cards passes the drag hooks (`cardRef`, `dragProps`) and a `menu` (the ⋯ with the moves,
 * for keyboard and touch); the card draws itself faded while it is dragged and ringed while
 * another hovers over it.
 */
export function TaskCard({
  task,
  projectId,
  showAssignee,
  showEstimate,
  muted,
  className,
  cardRef,
  dragProps,
  dragging,
  over,
  menu,
  ghost,
}: {
  task: LaneTask;
  projectId: string;
  showAssignee?: boolean;
  showEstimate?: boolean;
  muted?: boolean;
  className?: string;
  /** The drag-and-drop node (the draggable and the drop zone share it). */
  cardRef?: (el: HTMLDivElement | null) => void;
  /** The drag listeners and attributes, spread on the card. */
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  dragging?: boolean;
  over?: boolean;
  menu?: React.ReactNode;
  /** The copy that follows the pointer: no menu, no link, a shadow. */
  ghost?: boolean;
}) {
  const href = hrefFromEntry({ kind: "task", id: childId(projectId, task.id) });
  const open = useOpen({ href: ghost ? undefined : href });
  const missing = isMissingDataTask(task);
  const initials = task.assignee?.name?.trim().charAt(0).toUpperCase();
  const card = (
    <div
      role="button"
      tabIndex={0}
      {...dragProps}
      ref={cardRef}
      onClick={open.onClick}
      onKeyDown={(e) => {
        dragProps?.onKeyDown?.(e);
        if (!e.defaultPrevented) open.onKeyDown(e);
      }}
      data-href={ghost ? undefined : href}
      data-testid="task-card"
      className={cn(
        "group/card flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        muted && "opacity-70",
        dragging && "opacity-40",
        over && "ring-2 ring-ring/50",
        ghost && "rotate-1 shadow-lg",
        dragProps && "touch-none",
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
          {menu && !ghost && (
            // pressing the ⋯ opens its menu and neither starts a drag nor opens the task
            <span className="-my-1 -me-1.5 flex items-center opacity-70 group-hover/card:opacity-100 group-focus-within/card:opacity-100" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} data-no-open>
              {menu}
            </span>
          )}
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
  if (ghost) return card;
  return <PaneContextMenu href={href}>{card}</PaneContextMenu>;
}

/**
 * A card that can be picked up and that other cards can be dropped on, for the boards. The
 * id is `task:<id>`; `data` names the lane (or stage) the card sits in so the drop handler
 * knows where it landed. Nothing moves while `disabled`.
 */
export function DraggableTaskCard({
  task,
  data,
  disabled,
  active,
  ...rest
}: Omit<React.ComponentProps<typeof TaskCard>, "cardRef" | "dragProps" | "dragging" | "over"> & {
  data: Record<string, unknown>;
  disabled?: boolean;
  /** The id of the card being dragged, if any: this card fades when it is the one. */
  active?: string | null;
}) {
  const id = `task:${task.id}`;
  const drag = useDraggable({ id, data: { ...data, taskId: task.id }, disabled });
  const drop = useDroppable({ id, data: { ...data, taskId: task.id }, disabled });
  const ref = (el: HTMLDivElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <TaskCard
      task={task}
      cardRef={ref}
      dragProps={disabled ? undefined : ({ ...drag.listeners, ...drag.attributes } as React.HTMLAttributes<HTMLDivElement>)}
      dragging={active === task.id}
      over={drop.isOver && active !== task.id && !disabled}
      {...rest}
    />
  );
}

/** A lane the cards can be dropped on: the id names it; the body lights up while a card hovers. */
export function DropLane({ id, data, disabled, ...rest }: Omit<React.ComponentProps<typeof Lane>, "bodyRef" | "bodyClassName"> & { id: string; data: Record<string, unknown>; disabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled });
  return <Lane {...rest} bodyRef={setNodeRef} bodyClassName={cn(isOver && !disabled && "border-ring/60 bg-muted/40")} />;
}

/** Cards first (the pointer is over one), else the lane or sprint under the pointer, else the nearest thing. */
export const laneCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const card = within.find((c) => String(c.id).startsWith("task:"));
  if (card) return [card];
  if (within.length > 0) return within;
  return rectIntersection(args);
};

/** The pointer must travel a little before a drag starts, so a click still opens the card. */
export function useBoardSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
}
