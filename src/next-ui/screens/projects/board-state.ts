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

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
