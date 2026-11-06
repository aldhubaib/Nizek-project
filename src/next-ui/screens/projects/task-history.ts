import type { StageVisit, TaskHistoryActivity } from "@/actions/task-history";
import { describeActivity, describeStageVisit, formatDuration, isStageEcho } from "@/lib/task-history-format";

/**
 * The lines of a task's history, newest first: every stage it has been through (with how long
 * it stayed) and every change made to it, told the way the live panel tells them. Activity rows
 * that only echo a stage move are left out, so a move is not said twice.
 */
export interface HistoryLine {
  id: string;
  at: Date;
  text: string;
  /** How long the task stayed in that stage; "so far" while it is still there. */
  stay?: string;
  kind: "stage" | "change";
}

export function historyLines(visits: StageVisit[], activities: TaskHistoryActivity[]): HistoryLine[] {
  const stages: HistoryLine[] = visits.map((v) => ({
    id: `visit-${v.id}`,
    at: new Date(v.enteredAt),
    text: describeStageVisit(v),
    stay: v.ongoing ? `${formatDuration(v.durationMs)} so far` : formatDuration(v.durationMs),
    kind: "stage",
  }));
  const changes: HistoryLine[] = activities
    .filter((a) => !isStageEcho(a))
    .map((a) => ({ id: `activity-${a.id}`, at: new Date(a.createdAt), text: describeActivity(a), kind: "change" }));
  return [...stages, ...changes].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** "In Backlog for 2d 3h · sent back once" — the one line above the timeline. */
export function historySummaryText(summary: { currentStage: string | null; currentStageMs: number; regressions: number }, stageName: (s: string | null) => string): string {
  const parts = [summary.currentStage ? `In ${stageName(summary.currentStage)} for ${formatDuration(summary.currentStageMs)}` : null];
  if (summary.regressions === 1) parts.push("sent back once");
  else if (summary.regressions > 1) parts.push(`sent back ${summary.regressions} times`);
  return parts.filter(Boolean).join(" · ");
}
