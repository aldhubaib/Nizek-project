import type { Stage } from "@/generated/prisma/client";

/**
 * The single description of what a task's stage is allowed to be.
 *
 * `Sprint.status` is authoritative; `Task.stage` is a projection of it. Stages
 * split into two groups that are mutually exclusive in time:
 *
 * - lifecycle stages, which mirror the sprint (or the absence of one)
 * - work stages, which only exist while that sprint is ACTIVE
 *
 * Keeping the mapping here means the board, the roadmap, the audit module and
 * the migration all agree on one answer, instead of each remapping stages at
 * render time the way the client project view used to.
 */

/** Lifecycle order, start to finish. The single list every stage picker uses. */
export const STAGE_ORDER = [
  "BACKLOG",
  "PLANNED",
  "NEXT",
  "TODO",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "DONE",
  "COMPLETED",
  "SHIPPED",
] as const satisfies readonly Stage[];

/** Work stages: a person moves the task through these, inside an active sprint. */
export const WORK_STAGES = [
  "TODO",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "DONE",
] as const satisfies readonly Stage[];

/** Lifecycle stages: the sprint layer decides these, never a user. */
export const LIFECYCLE_STAGES = [
  "BACKLOG",
  "PLANNED",
  "NEXT",
  "COMPLETED",
  "SHIPPED",
] as const satisfies readonly Stage[];

export type WorkStage = (typeof WORK_STAGES)[number];

export function isWorkStage(stage: string): stage is WorkStage {
  return (WORK_STAGES as readonly string[]).includes(stage);
}

export function isLifecycleStage(stage: string): boolean {
  return (LIFECYCLE_STAGES as readonly string[]).includes(stage);
}

/**
 * Where a task belongs given the sprint holding it. Returns null for ACTIVE,
 * because an active sprint hands control to the work stages and the task's own
 * stage is then the truth.
 */
export function stageForSprintStatus(status: string | null | undefined): Stage | null {
  switch (status) {
    case "PLANNED":
      return "PLANNED";
    case "NEXT":
      return "NEXT";
    case "COMPLETED":
    case "PARTIALLY_COMPLETED":
      return "COMPLETED";
    case "SHIPPED":
      return "SHIPPED";
    case "ACTIVE":
      return null;
    default:
      // No sprint at all.
      return "BACKLOG";
  }
}

/**
 * Whether a stage is consistent with the sprint the task is in. This is the
 * invariant the migration reconciles and the tests assert.
 */
export function isStageValidForSprint(
  stage: Stage,
  sprintStatus: string | null | undefined,
): boolean {
  if (isWorkStage(stage)) return sprintStatus === "ACTIVE";
  if (stage === "BACKLOG") return !sprintStatus;
  return stageForSprintStatus(sprintStatus) === stage;
}

/**
 * Terminal states. Completed counts as finished on its own: client acceptance
 * moves a sprint to Shipped but is optional, so a task parked in Completed is
 * done, not waiting. Anything measuring staleness must skip these.
 */
export function isFinishedStage(stage: Stage): boolean {
  return stage === "COMPLETED" || stage === "SHIPPED";
}

/** Position along BACKLOG → SHIPPED. Unknown stages sort first. */
export function stageRank(stage: Stage | null | undefined): number {
  return stage ? (STAGE_ORDER as readonly Stage[]).indexOf(stage) : -1;
}

/**
 * A move back down the pipeline: a decline, or a task pushed to Backlog when
 * its sprint completed without it. Counting these is the point of the history,
 * so it is decided here rather than by each caller guessing at source values.
 */
export function isRegression(from: Stage | null | undefined, to: Stage): boolean {
  if (!from) return false;
  return stageRank(to) < stageRank(from);
}
