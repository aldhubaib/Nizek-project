"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { getAdminPermissions, getPermissionsFromRole } from "@/lib/permissions";
import { isRegression } from "@/lib/task-stage";
import type { Stage, StageSource } from "@/generated/prisma/client";

export interface HistoryPerson {
  id: string;
  name: string | null;
  imageUrl: string | null;
}

/** One stage visit, self-describing: who, from where, how long, which sprint. */
export interface StageVisit {
  id: string;
  stage: Stage;
  fromStage: Stage | null;
  enteredAt: Date;
  exitedAt: Date | null;
  /** Time spent in the stage; measured to now while the visit is still open. */
  durationMs: number;
  ongoing: boolean;
  source: StageSource;
  reason: string | null;
  actor: HistoryPerson | null;
  sprintId: string | null;
  sprintName: string | null;
  assignee: HistoryPerson | null;
}

export interface StageTotal {
  stage: Stage;
  ms: number;
  visits: number;
}

export interface TaskHistorySummary {
  createdAt: Date;
  totalMs: number;
  currentStage: Stage | null;
  currentStageMs: number;
  /** Declines and sprint pushbacks — every time the task went backwards. */
  regressions: number;
  timeOutsideSprintMs: number;
  stageTotals: StageTotal[];
}

export interface TaskHistoryActivity {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: HistoryPerson;
}

export type TaskHistory =
  | { allowed: false }
  | {
      allowed: true;
      visits: StageVisit[];
      activities: TaskHistoryActivity[];
      summary: TaskHistorySummary;
    };

/**
 * The stage-by-stage lifecycle of a task.
 *
 * Read from `StageLog`, which every write path stamps with an actor and a
 * source, rather than replayed from `TaskActivity`. The old dialog inferred
 * transitions by subtracting activity timestamps, so any move made by the
 * sprint layer — a start, a completion, a pushback — was invisible and its
 * elapsed time landed on whichever stage was mentioned last.
 *
 * Gated server-side rather than by hiding the button: the actor names and the
 * durations are the sensitive part.
 */
export async function getTaskHistory(taskId: string): Promise<TaskHistory> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, createdAt: true },
  });
  if (!task) throw new Error("Task not found");

  const { user, member } = await requireProjectMember(task.projectId);
  const permissions =
    user.systemRole === "ADMIN"
      ? getAdminPermissions()
      : getPermissionsFromRole(member.projectRole);
  if (!permissions.canViewTaskHistory) return { allowed: false };

  const [logs, activities] = await Promise.all([
    prisma.stageLog.findMany({
      where: { taskId },
      orderBy: { enteredAt: "asc" },
      include: { actor: { select: { id: true, name: true, imageUrl: true } } },
    }),
    prisma.taskActivity.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, imageUrl: true } } },
    }),
  ]);

  const assigneeIds = [...new Set(logs.map((l) => l.assigneeId).filter((id): id is string => !!id))];
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  const now = Date.now();
  const totals = new Map<Stage, StageTotal>();
  let regressions = 0;
  let timeOutsideSprintMs = 0;

  const visits: StageVisit[] = logs.map((log) => {
    const entered = log.enteredAt.getTime();
    const exited = log.exitedAt?.getTime() ?? now;
    const durationMs = Math.max(0, exited - entered);

    const total = totals.get(log.stage) ?? { stage: log.stage, ms: 0, visits: 0 };
    total.ms += durationMs;
    total.visits += 1;
    totals.set(log.stage, total);

    if (isRegression(log.fromStage, log.stage)) regressions += 1;
    if (!log.sprintId) timeOutsideSprintMs += durationMs;

    return {
      id: log.id,
      stage: log.stage,
      fromStage: log.fromStage,
      enteredAt: log.enteredAt,
      exitedAt: log.exitedAt,
      durationMs,
      ongoing: log.exitedAt === null,
      source: log.source,
      reason: log.reason,
      actor: log.actor,
      sprintId: log.sprintId,
      sprintName: log.sprintName,
      assignee: log.assigneeId ? assigneeById.get(log.assigneeId) ?? null : null,
    };
  });

  const open = visits.find((v) => v.ongoing) ?? visits[visits.length - 1] ?? null;

  return {
    allowed: true,
    visits,
    activities,
    summary: {
      createdAt: task.createdAt,
      totalMs: Math.max(0, now - task.createdAt.getTime()),
      currentStage: open?.stage ?? null,
      currentStageMs: open?.ongoing ? open.durationMs : 0,
      regressions,
      timeOutsideSprintMs,
      stageTotals: [...totals.values()],
    },
  };
}
