import "server-only";
import type { Prisma, Stage, StageSource } from "@/generated/prisma/client";

/**
 * Every write that changes `Task.stage` must go through here.
 *
 * Before this existed, four of the six paths that moved a task wrote no history
 * at all, so a task could jump from Todo to Backlog with nothing recorded. What
 * history there was could not say who did anything: `StageLog` held the
 * durations, `TaskActivity` held the people, and the only thing joining them was
 * a timestamp that happened to be close.
 *
 * `actorId` and `source` are required arguments rather than optional ones. That
 * is deliberate — it is what stops a future call site from quietly adding an
 * unattributed transition.
 */

/** Accepts the client or a transaction client, so callers can compose. */
export type StageWriteClient = Prisma.TransactionClient;

/** Activity written alongside the log, so the two stay in step. Null means the
 *  caller already logs its own activity, or there is no person to attribute. */
const ACTIVITY_ACTION: Record<StageSource, string | null> = {
  TASK_CREATED: null,
  USER_MOVE: "moved",
  DECLINE: "declined",
  SPRINT_SCHEDULE: "moved",
  SPRINT_UNSCHEDULE: "moved",
  SPRINT_START: "moved",
  SPRINT_COMPLETE: "moved",
  SPRINT_STATUS: "moved",
  MIGRATION: null,
};

export interface StageChange {
  taskId: string;
  /** Null only when the task is being created. */
  fromStage: Stage | null;
  toStage: Stage;
  /** Null only for transitions no person triggered; `source` then explains it. */
  actorId: string | null;
  source: StageSource;
  /** Decline comment, incomplete reason, "Sprint 21 completed". */
  reason?: string | null;
  sprintId?: string | null;
  /** Copied, not looked up: history must survive the sprint being deleted. */
  sprintName?: string | null;
  /** Who held the task on entry, copied for the same reason. */
  assigneeId?: string | null;
  at?: Date;
}

export async function applyStageChange(
  db: StageWriteClient,
  change: StageChange,
): Promise<void> {
  // A stage that did not change is not a visit. Recording one would split a
  // single stretch of time into two shorter ones and understate how long the
  // task actually sat there.
  if (change.fromStage !== null && change.fromStage === change.toStage) return;

  const at = change.at ?? new Date();

  // Closed first: a partial unique index allows only one open row per task, so
  // inserting before closing would be rejected.
  await db.stageLog.updateMany({
    where: { taskId: change.taskId, exitedAt: null },
    data: { exitedAt: at },
  });

  await db.stageLog.create({
    data: {
      taskId: change.taskId,
      stage: change.toStage,
      fromStage: change.fromStage,
      enteredAt: at,
      actorId: change.actorId,
      source: change.source,
      reason: change.reason ?? null,
      sprintId: change.sprintId ?? null,
      sprintName: change.sprintName ?? null,
      assigneeId: change.assigneeId ?? null,
    },
  });

  const action = ACTIVITY_ACTION[change.source];
  if (action && change.actorId) {
    await db.taskActivity.create({
      data: {
        taskId: change.taskId,
        userId: change.actorId,
        action,
        field: "stage",
        oldValue: change.fromStage,
        newValue: change.toStage,
      },
    });
  }
}

export interface BulkStageChange {
  /** Read before the update, so `stage` is the stage each task is leaving.
   *  A per-task `reason` wins over the shared one, since sprint completion
   *  records a different explanation for each unfinished task. */
  tasks: {
    id: string;
    stage: Stage;
    assigneeId?: string | null;
    reason?: string | null;
  }[];
  toStage: Stage;
  actorId: string | null;
  source: StageSource;
  reason?: string | null;
  sprintId?: string | null;
  sprintName?: string | null;
  at?: Date;
}

/**
 * Same guarantees for sprint fan-out, in three statements regardless of how many
 * tasks a sprint holds.
 */
export async function applyBulkStageChange(
  db: StageWriteClient,
  change: BulkStageChange,
): Promise<void> {
  const moving = change.tasks.filter((t) => t.stage !== change.toStage);
  if (moving.length === 0) return;
  const at = change.at ?? new Date();
  const taskIds = moving.map((t) => t.id);

  await db.stageLog.updateMany({
    where: { taskId: { in: taskIds }, exitedAt: null },
    data: { exitedAt: at },
  });

  await db.stageLog.createMany({
    data: moving.map((task) => ({
      taskId: task.id,
      stage: change.toStage,
      fromStage: task.stage,
      enteredAt: at,
      actorId: change.actorId,
      source: change.source,
      reason: task.reason ?? change.reason ?? null,
      sprintId: change.sprintId ?? null,
      sprintName: change.sprintName ?? null,
      assigneeId: task.assigneeId ?? null,
    })),
  });

  const action = ACTIVITY_ACTION[change.source];
  if (action && change.actorId) {
    const actorId = change.actorId;
    await db.taskActivity.createMany({
      data: moving.map((task) => ({
        taskId: task.id,
        userId: actorId,
        action,
        field: "stage",
        oldValue: task.stage,
        newValue: change.toStage,
      })),
    });
  }
}
