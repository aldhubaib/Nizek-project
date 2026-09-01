import { TASK_STAGE_BADGE, stageLabel } from "@/lib/task-label";
import type { StageVisit, TaskHistoryActivity } from "@/actions/task-history";

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * One line saying what happened, for a single stage visit.
 *
 * Every visit is attributable: either a person did it, or a sprint action did
 * and we name the sprint. `MIGRATION` is the one case with no honest answer —
 * those rows were reconstructed by the backfill, so they say so rather than
 * pretending someone made the move.
 */
export function describeStageVisit(v: StageVisit): string {
  const who = v.actor?.name ?? null;
  const to = stageLabel(v.stage);
  const from = stageLabel(v.fromStage);
  const sprint = v.sprintName ?? "the sprint";

  switch (v.source) {
    case "TASK_CREATED":
      return `${who ?? "Someone"} created this task in ${to}`;
    case "USER_MOVE":
      return `${who ?? "Someone"} moved ${from} → ${to}`;
    case "DECLINE":
      return `${who ?? "Someone"} declined at ${from} → back to ${to}`;
    case "SPRINT_SCHEDULE":
      return `${who ?? "Someone"} scheduled it into ${sprint} → ${to}`;
    case "SPRINT_UNSCHEDULE":
      return `${who ?? "Someone"} removed it from ${sprint} → ${to}`;
    case "SPRINT_START":
      return `${sprint} started → ${to}${who ? ` (by ${who})` : ""}`;
    case "SPRINT_COMPLETE":
      return `${sprint} completed → ${to}${who ? ` (by ${who})` : ""}`;
    case "SPRINT_STATUS":
      return `${sprint} moved → ${to}${who ? ` (by ${who})` : ""}`;
    case "MIGRATION":
      return `Recorded as ${to} when history was backfilled`;
    default:
      return `Moved ${from} → ${to}`;
  }
}

export function describeActivity(a: TaskHistoryActivity): string {
  const name = a.user.name ?? "Someone";
  switch (a.action) {
    case "assigned":
      return `${name} assigned to ${a.newValue ?? "someone"}`;
    case "unassigned":
      return `${name} unassigned ${a.oldValue ?? "the assignee"}`;
    case "archived":
      return `${name} archived this task`;
    case "restored":
      return `${name} restored this task`;
    case "scheduled":
      return `${name} scheduled it into ${a.newValue ?? "a sprint"}`;
    case "unscheduled":
      return `${name} removed it from ${a.oldValue ?? "a sprint"}`;
    case "updated":
      if (a.field === "priority") return `${name} changed priority from ${a.oldValue ?? "—"} to ${a.newValue ?? "—"}`;
      if (a.field === "title") return `${name} renamed task`;
      return `${name} updated ${a.field ?? "task"}`;
    case "answered":
      return `${name} updated an answer`;
    case "note_created":
      return `${name} added a note${a.newValue ? `: ${a.newValue}` : ""}`;
    case "transferred":
      return `${name} removed ${a.oldValue ?? "a member"} → assigned ${a.newValue ?? "another member"}`;
    case "proof_of_work":
      return `${name} uploaded proof of work${a.newValue ? `: ${a.newValue}` : ""}`;
    case "proof_bypass":
      return `${name} used a bypass (approved by ${a.newValue ?? "a manager"})`;
    default:
      return `${name} ${a.action}`;
  }
}

/**
 * Stage moves now come from the lifecycle spine, so the activity rows that
 * merely echo them would show every transition twice.
 */
export function isStageEcho(a: TaskHistoryActivity): boolean {
  if (a.action === "created") return true;
  return (a.action === "moved" || a.action === "declined") && a.field === "stage";
}

/** Stage order for the filter chips, taken from the badge declaration order. */
export function orderStages(stages: string[]): string[] {
  const order = Object.keys(TASK_STAGE_BADGE);
  return [...stages].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
