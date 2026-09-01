// Pure decision logic for the Task Audit module. Mirrors the dashboard
// monitors: critical late (stuck in stage > 7d), rejected (declined > 2
// times), overdue deadlines, warn late (> 2d), and awaiting client input
// (> 2d). Kept free of Prisma/React so it is unit-testable.

import { TASK_STAGE_BADGE } from "@/lib/task-label";
import { WORK_STAGES } from "@/lib/task-stage";

export type AuditFlagType =
  | "critical_late"
  | "rejected"
  | "deadline_overdue"
  | "warn_late"
  | "client_input";

export const WARN_LATE_MS = 2 * 24 * 60 * 60 * 1000;
export const CRITICAL_LATE_MS = 7 * 24 * 60 * 60 * 1000;
export const CLIENT_INPUT_WAIT_MS = 2 * 24 * 60 * 60 * 1000;
export const REJECTED_THRESHOLD = 2; // flag when declines > 2

/**
 * Stages where a task being slow is somebody's fault.
 *
 * Everything outside an active sprint is waiting by design: Backlog, Planned and
 * Next have not started, and Completed and Shipped have finished. Completed
 * especially — client acceptance is optional, so a sprint can sit there forever
 * and its tasks are delivered, not late. Including it would flag every finished
 * task in the system.
 *
 * Done is left out for the same reason at task level: once it is marked Done the
 * only thing left is the sprint closing, which is not the assignee's to do.
 */
export const ACTIVE_STAGES = WORK_STAGES.filter((s) => s !== "DONE");

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_STAGE_BADGE).map(([k, v]) => [k, v.label]),
);

/** Lower rank = more urgent; reports list items in this order. */
const SEVERITY_RANK: Record<AuditFlagType, number> = {
  critical_late: 0,
  rejected: 1,
  deadline_overdue: 2,
  warn_late: 3,
  client_input: 4,
};

export function severityRank(flagType: AuditFlagType): number {
  return SEVERITY_RANK[flagType];
}

export const FLAG_LABELS: Record<AuditFlagType, string> = {
  critical_late: "Critical late",
  rejected: "Rejected",
  deadline_overdue: "Deadline overdue",
  warn_late: "Late",
  client_input: "Awaiting client input",
};

/**
 * Classifies how long a task has sat in its current stage.
 * Returns null when the duration is still acceptable.
 */
export function classifyStageDuration(
  stageMs: number,
): "critical_late" | "warn_late" | null {
  if (stageMs >= CRITICAL_LATE_MS) return "critical_late";
  if (stageMs >= WARN_LATE_MS) return "warn_late";
  return null;
}

/** Declined-count gate used by the dashboard's rejection monitor. */
export function isRejectedFlag(declineCount: number): boolean {
  return declineCount > REJECTED_THRESHOLD;
}

export interface AuditItemSortable {
  severity: number;
  stageHours?: number | null;
  declineCount?: number | null;
  dueInDays?: number | null;
}

/**
 * Report ordering: severity groups first, then the worst offender within a
 * group (longest in stage, most declines, most overdue).
 */
export function compareAuditItems(
  a: AuditItemSortable,
  b: AuditItemSortable,
): number {
  if (a.severity !== b.severity) return a.severity - b.severity;
  const stageDiff = (b.stageHours ?? 0) - (a.stageHours ?? 0);
  if (stageDiff !== 0) return stageDiff;
  const declineDiff = (b.declineCount ?? 0) - (a.declineCount ?? 0);
  if (declineDiff !== 0) return declineDiff;
  return (a.dueInDays ?? 0) - (b.dueInDays ?? 0);
}

// ─── Ownership timeline ─────────────────────────────────

export interface OwnershipActivity {
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string | Date;
  user: { id: string; name: string | null; imageUrl?: string | null };
}

/** One row of `StageLog`, the stored record of a single stage visit. */
export interface OwnershipStageVisit {
  stage: string;
  fromStage?: string | null;
  enteredAt: string | Date;
  exitedAt?: string | Date | null;
  source: string;
  sprintName?: string | null;
  actor?: { id: string; name: string | null; imageUrl?: string | null } | null;
}

export interface OwnershipEvent {
  userId: string;
  userName: string | null;
  imageUrl?: string | null;
  label: string;
  at: string;
  /** The stage this person put the task into, when the event was a move. */
  stage?: string | null;
  /** How long it then sat there. This is what justifies the blame. */
  heldMs?: number | null;
}

/** Assignment changes, which are ownership but not stage moves. */
const ASSIGNMENT_ACTIONS = new Set(["assigned", "unassigned", "transferred"]);

/**
 * The people who moved a task, and how long it sat under each of them.
 *
 * Built from `StageLog` rather than replayed from `TaskActivity`. The activity
 * log only ever recorded user-driven moves, so a task promoted by starting a
 * sprint or pushed back by completing one produced no event at all, and the
 * elapsed time was silently attributed to whoever moved it last. `StageLog` has
 * a row per visit with a stored actor, source and duration, so every move is
 * present and every duration is a fact rather than a subtraction between two
 * unrelated activity rows.
 *
 * Assignment events are merged in from `TaskActivity`, since changing the
 * assignee mid-stage is an ownership change that no stage row describes.
 *
 * Rows written by the backfill migration are skipped: they are reconstructions,
 * not things a person did, and blaming someone for one would be wrong.
 */
export function buildOwnershipTimeline(
  visits: OwnershipStageVisit[],
  activities: OwnershipActivity[] = [],
  now: number = Date.now(),
): OwnershipEvent[] {
  const events: OwnershipEvent[] = [];

  for (const v of visits) {
    if (v.source === "MIGRATION") continue;
    if (!v.actor) continue;

    const enteredAt = new Date(v.enteredAt);
    const exited = v.exitedAt ? new Date(v.exitedAt).getTime() : now;

    events.push({
      userId: v.actor.id,
      userName: v.actor.name,
      imageUrl: v.actor.imageUrl ?? null,
      label: describeStageVisit(v),
      at: enteredAt.toISOString(),
      stage: v.stage,
      heldMs: Math.max(0, exited - enteredAt.getTime()),
    });
  }

  for (const a of activities) {
    const isAssigneeUpdate = a.action === "updated" && a.field === "assignee";
    if (!ASSIGNMENT_ACTIONS.has(a.action) && !isAssigneeUpdate) continue;

    let label: string;
    switch (a.action) {
      case "assigned":
        label = a.newValue ? `Assigned to ${a.newValue}` : "Assigned the task";
        break;
      case "unassigned":
        label = "Removed the assignee";
        break;
      case "transferred":
        label = a.newValue
          ? `Removed ${a.oldValue ?? "a member"} → assigned ${a.newValue}`
          : "Ownership transferred";
        break;
      default:
        label = a.newValue ? `Took ownership (${a.newValue})` : "Took ownership";
    }

    events.push({
      userId: a.user.id,
      userName: a.user.name,
      imageUrl: a.user.imageUrl ?? null,
      label,
      at: new Date(a.createdAt).toISOString(),
    });
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function describeStageVisit(v: OwnershipStageVisit): string {
  const to = labelFor(v.stage);
  const from = labelFor(v.fromStage);
  const sprint = v.sprintName ?? "the sprint";

  switch (v.source) {
    case "TASK_CREATED":
      return `Created the task in ${to}`;
    case "DECLINE":
      return `Declined at ${from} → back to ${to}`;
    case "SPRINT_SCHEDULE":
      return `Scheduled into ${sprint} → ${to}`;
    case "SPRINT_UNSCHEDULE":
      return `Removed from ${sprint} → ${to}`;
    case "SPRINT_START":
      return `Started ${sprint} → ${to}`;
    case "SPRINT_COMPLETE":
      return `Completed ${sprint} → ${to}`;
    case "SPRINT_STATUS":
      return `Moved ${sprint} → ${to}`;
    default:
      return `Moved ${from} → ${to}`;
  }
}

function labelFor(stage: string | null | undefined): string {
  if (!stage) return "?";
  return STAGE_LABELS[stage] ?? stage;
}

/**
 * Distinct people from a timeline (latest involvement first) — the dropdown
 * candidates for blame.
 */
export function blameCandidates(
  events: OwnershipEvent[],
): { userId: string; userName: string | null; imageUrl?: string | null }[] {
  const seen = new Map<
    string,
    { userId: string; userName: string | null; imageUrl?: string | null; at: string }
  >();
  for (const e of events) {
    const existing = seen.get(e.userId);
    if (!existing || e.at > existing.at) {
      seen.set(e.userId, {
        userId: e.userId,
        userName: e.userName,
        imageUrl: e.imageUrl,
        at: e.at,
      });
    }
  }
  return [...seen.values()]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map(({ userId, userName, imageUrl }) => ({ userId, userName, imageUrl }));
}

// ─── Misc helpers ───────────────────────────────────────

export function msToHours(ms: number): number {
  return Math.floor(ms / (60 * 60 * 1000));
}

export function formatStageHours(hours: number): string {
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** UTC midnight for a calendar day — the canonical `auditDate`. */
export function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
