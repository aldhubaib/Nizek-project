// Pure decision logic for the Task Audit module. Mirrors the dashboard
// monitors: critical late (stuck in stage > 7d), rejected (declined > 2
// times), overdue deadlines, warn late (> 2d), and awaiting client input
// (> 2d). Kept free of Prisma/React so it is unit-testable.

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

/** Stages a task actively moves through — where "stuck" is meaningful. */
export const ACTIVE_STAGES = [
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  CLARIFICATION: "Clarification",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  DONE: "Done",
};

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

export interface OwnershipEvent {
  userId: string;
  userName: string | null;
  imageUrl?: string | null;
  label: string;
  at: string;
}

const OWNERSHIP_ACTIONS = new Set([
  "created",
  "assigned",
  "unassigned",
  "moved",
  "declined",
  "transferred",
]);

/**
 * Reduces a task's activity log to the people who touched ownership or flow:
 * creator, every assignee change, stage moves, and declines. This is the
 * candidate pool the auditor picks the responsible person from.
 */
export function buildOwnershipTimeline(
  activities: OwnershipActivity[],
): OwnershipEvent[] {
  const events: OwnershipEvent[] = [];
  for (const a of activities) {
    const isAssigneeUpdate = a.action === "updated" && a.field === "assignee";
    if (!OWNERSHIP_ACTIONS.has(a.action) && !isAssigneeUpdate) continue;

    let label: string;
    switch (a.action) {
      case "created":
        label = "Created the task";
        break;
      case "assigned":
        label = a.newValue ? `Assigned to ${a.newValue}` : "Assigned the task";
        break;
      case "unassigned":
        label = "Removed the assignee";
        break;
      case "moved":
        label = `Moved ${labelFor(a.oldValue)} → ${labelFor(a.newValue)}`;
        break;
      case "declined":
        label = `Declined at ${labelFor(a.oldValue)}`;
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
  return events;
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
