import { format } from "date-fns";

import {
  compareClosedSprints,
  comparePlannedSprints,
  isClosedSprint,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { isMissingDataTask } from "@/lib/task-readiness";

/**
 * How the road map and the active sprint group a project's tasks. Pure functions over the
 * shapes the server actions return, so the screens only lay things out. The rules are the live
 * panel's: a loose task (no sprint, not done) sits in the backlog, or in Missing data while a
 * mandatory question is unanswered; a task in a planned sprint is Planned; a task in the next
 * sprint is Next; a started sprint holds its tasks itself.
 */

export interface LaneTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  order: number;
  priority: string;
  sprintId?: string | null;
  isReadyForTransition?: boolean;
  sprintCount?: number;
  assignee?: { id: string; name: string | null; imageUrl: string | null } | null;
  estimatedMinutes?: number | null;
  declineCount?: number;
}

export interface LaneSprint {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
  completedAt: string | null;
  reviewDate?: string | null;
  updatedAt: string;
  taskCount: number;
  goal?: string | null;
}

export type TaskLaneId = "missing" | "backlog" | "planned" | "next";

export const TASK_LANES: { id: TaskLaneId; label: string; status: string; empty: string }[] = [
  { id: "missing", label: "Missing data", status: "MISSING_DATA", empty: "No tasks with missing data." },
  { id: "backlog", label: "Backlog", status: "BACKLOG", empty: "Nothing waiting. Higher in the list is higher priority." },
  { id: "planned", label: "Planned", status: "PLANNED", empty: "No tasks planned for a later sprint." },
  { id: "next", label: "Next", status: "NEXT", empty: "No tasks lined up for the next sprint." },
];

/** The sprint lanes after the task lanes; each holds sprints as cards. */
export const SPRINT_LANES: { id: SprintBoardColumn; label: string; status: string; empty: string }[] = [
  { id: "ACTIVE", label: "In progress", status: "ACTIVE", empty: "No sprint running." },
  { id: "COMPLETED", label: "Completed", status: "COMPLETED", empty: "No sprint finished yet." },
  { id: "SHIPPED", label: "Shipped", status: "SHIPPED", empty: "Nothing shipped yet." },
];

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function roadmapLanes<T extends LaneTask>(tasks: T[], sprints: LaneSprint[]): Record<TaskLaneId, T[]> {
  const planned = new Set(sprints.filter((s) => s.status === "PLANNED").map((s) => s.id));
  const next = sprints.find((s) => s.status === "NEXT")?.id ?? null;
  const loose = tasks.filter((t) => !t.sprintId && t.stage !== "DONE");
  return {
    missing: loose.filter((t) => isMissingDataTask(t)).sort(byOrder),
    backlog: loose.filter((t) => !isMissingDataTask(t)).sort(byOrder),
    planned: tasks.filter((t) => t.sprintId && planned.has(t.sprintId) && t.stage !== "DONE").sort(byOrder),
    next: tasks.filter((t) => t.sprintId && t.sprintId === next && t.stage !== "DONE").sort(byOrder),
  };
}

/** Sprints by lane: the running one(s), then the finished ones newest first, then the shipped ones. */
export function sprintLanes<S extends LaneSprint>(sprints: S[]): Record<SprintBoardColumn, S[]> {
  const groups: Record<SprintBoardColumn, S[]> = { PLANNED: [], NEXT: [], ACTIVE: [], COMPLETED: [], SHIPPED: [] };
  for (const s of sprints) groups[sprintBoardColumn(s.status)].push(s);
  groups.PLANNED.sort(comparePlannedSprints);
  groups.COMPLETED.sort(compareClosedSprints);
  groups.SHIPPED.sort(compareClosedSprints);
  return groups;
}

export function tasksOfSprint<T extends LaneTask>(tasks: T[], sprintId: string): T[] {
  return tasks.filter((t) => t.sprintId === sprintId).sort(byOrder);
}

/** The columns of the active sprint's board, in lifecycle order. Backlog is the road map's. */
export const SPRINT_STAGES = ["TODO", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "DONE"] as const;
export type SprintStage = (typeof SPRINT_STAGES)[number];

export function activeSprintStages<T extends LaneTask>(tasks: T[], sprintId: string): Record<SprintStage, T[]> {
  const mine = tasksOfSprint(tasks, sprintId);
  const groups: Record<SprintStage, T[]> = { TODO: [], IN_DEVELOPMENT: [], INTERNAL_REVIEW: [], DONE: [] };
  for (const t of mine) {
    // a task still marked backlog inside a running sprint is to do; the server promotes it the same way
    const stage = (SPRINT_STAGES as readonly string[]).includes(t.stage) ? (t.stage as SprintStage) : "TODO";
    groups[stage].push(t);
  }
  return groups;
}

export function activeSprint<S extends LaneSprint>(sprints: S[]): S | null {
  return sprints.find((s) => s.status === "ACTIVE") ?? null;
}

/** "3 Mar – 14 Mar 2026"; the year once when both ends share it. */
export function sprintDates(s: { startDate: string; endDate: string }): string {
  const a = new Date(s.startDate);
  const b = new Date(s.endDate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${format(a, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
}

/** "4 days left", "Ends today", "Overdue by 2 days" for a running sprint. */
export function sprintTimeLeft(s: { endDate: string }, now: Date): string {
  const end = new Date(s.endDate);
  if (Number.isNaN(end.getTime())) return "";
  const dayMs = 86_400_000;
  const days = Math.ceil((end.getTime() - now.getTime()) / dayMs);
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "Ends today";
  return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
}

export { isClosedSprint };
export { formatFileSize, formatMinutes } from "@/next-ui/blocks/format";

/* ------------------------------------------------------------------------------------------ */
/* Dragging                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** What a card was dropped on, on the road map: a lane, a task in a lane, or a sprint card. */
export type RoadmapDropTarget = { kind: "lane"; lane: TaskLaneId } | { kind: "task"; lane: TaskLaneId; taskId: string } | { kind: "sprint"; sprintId: string; status: string };

/** What a drop on the road map means, worked out from the live panel's rules before anything is sent. */
export type RoadmapDropAction =
  | { kind: "none" }
  | { kind: "refuse"; reason: string }
  | { kind: "reorder"; lane: TaskLaneId; overTaskId: string }
  | { kind: "unschedule" }
  | { kind: "schedule"; column: "PLANNED" | "NEXT"; sprintId: string | null }
  | { kind: "into-sprint"; sprintId: string; running: boolean };

export const MISSING_DATA_NOTICE = "This task still has missing data. Fill in all required fields first.";

/**
 * The road map's drop rules, the live panel's: Missing data takes nothing; the Backlog takes a
 * ready task out of its sprint, or reorders its own; Planned and Next take a ready task into
 * the lane's sprint (made on the server when the lane is empty) or reorder their own; a sprint
 * card takes a ready task into that sprint — with a reason when it is running — and a closed
 * sprint takes nothing. A task dropped where it already is does nothing.
 */
export function roadmapDrop(
  task: LaneTask,
  target: RoadmapDropTarget,
  lanes: { planned: Set<string>; next: string | null; firstPlanned: string | null },
): RoadmapDropAction {
  const missing = isMissingDataTask(task);
  const inPlanned = Boolean(task.sprintId && lanes.planned.has(task.sprintId));
  const inNext = Boolean(task.sprintId && task.sprintId === lanes.next);
  if (target.kind === "sprint") {
    if (isClosedSprint(target.status)) return { kind: "none" };
    if (task.sprintId === target.sprintId) return { kind: "none" };
    if (missing) return { kind: "refuse", reason: MISSING_DATA_NOTICE };
    return { kind: "into-sprint", sprintId: target.sprintId, running: target.status === "ACTIVE" };
  }
  const lane = target.lane;
  const overTask = target.kind === "task" && target.taskId !== task.id ? target.taskId : null;
  switch (lane) {
    case "missing":
      return { kind: "none" };
    case "backlog":
      if (missing) return { kind: "refuse", reason: MISSING_DATA_NOTICE };
      if (!task.sprintId) return overTask ? { kind: "reorder", lane, overTaskId: overTask } : { kind: "none" };
      return { kind: "unschedule" };
    case "planned":
      if (missing) return { kind: "refuse", reason: MISSING_DATA_NOTICE };
      if (inPlanned) return overTask ? { kind: "reorder", lane, overTaskId: overTask } : { kind: "none" };
      return { kind: "schedule", column: "PLANNED", sprintId: lanes.firstPlanned };
    case "next":
      if (missing) return { kind: "refuse", reason: MISSING_DATA_NOTICE };
      if (inNext) return overTask ? { kind: "reorder", lane, overTaskId: overTask } : { kind: "none" };
      return { kind: "schedule", column: "NEXT", sprintId: lanes.next };
  }
}

/** The new `order` of each task that moves when `taskId` is dropped on `overTaskId` in one lane. */
export function reorderedTasks<T extends { id: string; order: number }>(list: T[], taskId: string, overTaskId: string): { taskId: string; order: number }[] {
  const from = list.findIndex((t) => t.id === taskId);
  const to = list.findIndex((t) => t.id === overTaskId);
  if (from < 0 || to < 0 || from === to) return [];
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((t, order) => ({ taskId: t.id, order })).filter(({ taskId: id, order }) => list.find((t) => t.id === id)!.order !== order);
}

/** One step forward along the sprint board, or back to In development from review (the decline). */
export function sprintStageMoves(stage: string): { to: SprintStage; decline?: boolean }[] {
  const i = (SPRINT_STAGES as readonly string[]).indexOf(stage);
  const out: { to: SprintStage; decline?: boolean }[] = [];
  if (i >= 0 && i < SPRINT_STAGES.length - 1) out.push({ to: SPRINT_STAGES[i + 1] });
  if (stage === "INTERNAL_REVIEW") out.push({ to: "IN_DEVELOPMENT", decline: true });
  return out;
}

/**
 * Whether a drag on the sprint board is a move the board allows at all: one stage forward,
 * review straight to Done, or the decline back from review. Anything else is dropped quietly,
 * as on the live board.
 */
export function isValidSprintMove(from: string, to: string): boolean {
  const a = (SPRINT_STAGES as readonly string[]).indexOf(from);
  const b = (SPRINT_STAGES as readonly string[]).indexOf(to);
  if (a < 0 || b < 0) return false;
  if (b === a + 1) return true;
  if (from === "INTERNAL_REVIEW" && to === "DONE") return true;
  if (from === "INTERNAL_REVIEW" && to === "IN_DEVELOPMENT") return true;
  return false;
}
