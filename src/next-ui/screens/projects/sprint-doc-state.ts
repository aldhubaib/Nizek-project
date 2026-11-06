import { isAddedTask, type SprintCardCarry } from "@/lib/sprint-doc";
import {
  blankPlanningSchedule,
  countSprintTaskFieldGaps,
  emptySprintInfoFieldCount,
  formatPlanningDate,
  normalizeSprintPlanningInfo,
  planningDateIso,
  sprintEndGaps,
  sprintStartGaps,
  type SprintGaps,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import { isUnstartedSprint } from "@/lib/sprint-status";

/**
 * What the sprint document screen works out before it draws: which Sprint Information to show
 * when the document has none yet, how the outcome's tasks group, what is still missing before
 * Start or End. Pure, so the rules are testable without a screen.
 */

/** The live document's four groups: promised or added, then finished or not. */
export interface OutcomeGroups {
  committed: { completed: SprintPlanningTask[]; incomplete: SprintPlanningTask[] };
  added: { completed: SprintPlanningTask[]; incomplete: SprintPlanningTask[] };
}

/**
 * Group the outcome as the document writes it: by whether the work was promised before the
 * sprint started (the committed list the document recorded; each task's own flag when it
 * recorded none), then by whether it landed.
 */
export function groupOutcome(completed: SprintPlanningTask[], incomplete: SprintPlanningTask[], committedIds: string[]): OutcomeGroups {
  const ids = new Set(committedIds);
  const added = (t: SprintPlanningTask) => isAddedTask(t, ids);
  return {
    committed: { completed: completed.filter((t) => !added(t)), incomplete: incomplete.filter((t) => !added(t)) },
    added: { completed: completed.filter(added), incomplete: incomplete.filter(added) },
  };
}

/**
 * The Sprint Information to show: the document's own rows when there is a document; otherwise
 * what a new document would start with — an empty table before the sprint starts (to be filled
 * in by whoever plans it), the sprint's dates with today's review date once it has.
 */
export function infoToShow(docInfo: SprintPlanningInfo | null | undefined, planInfo: SprintPlanningInfo | undefined, status: string | undefined): SprintPlanningInfo | null {
  if (docInfo) return normalizeSprintPlanningInfo(docInfo);
  if (!planInfo) return null;
  if (!status || isUnstartedSprint(status)) return normalizeSprintPlanningInfo(blankPlanningSchedule(planInfo));
  const iso = planningDateIso(new Date());
  return normalizeSprintPlanningInfo({ ...planInfo, locked: true, reviewDateIso: planInfo.reviewDateIso || iso, reviewDate: planInfo.reviewDate || formatPlanningDate(iso) });
}

/** A date row's value for a date box: the day only, or nothing. */
export const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/** The reason written against an unfinished task: what is being typed, else what the document holds. */
export function reasonOf(taskId: string, drafts: Record<string, string>, carry: Record<string, SprintCardCarry>): string {
  return (drafts[taskId] ?? carry[taskId]?.incompleteReason ?? "").trim();
}

/** What still blocks Start, counted as the live document counts it. */
export function startGaps(opts: {
  info: SprintPlanningInfo | null;
  tasks: SprintPlanningTask[];
  activeSprintName: string | null;
  /** A client sees no assignees, so none is missing for them. */
  hideAssignees: boolean;
}): SprintGaps {
  const { info } = opts;
  const datesInvalid = Boolean(info?.startIso && info?.endIso && info.endIso < info.startIso);
  const fields = countSprintTaskFieldGaps(opts.tasks);
  return sprintStartGaps({
    activeSprintName: opts.activeSprintName,
    datesInvalid,
    emptyInfoFields: emptySprintInfoFieldCount(info),
    missingEstimates: fields.estimates,
    missingAssignees: opts.hideAssignees ? 0 : fields.assignees,
    missingDecisions: fields.decisions,
    missingRisks: fields.risks,
  });
}

/** What still blocks End: the information rows (with the review date), a reason per unfinished task, the review video where one is required. */
export function endGaps(opts: { info: SprintPlanningInfo | null; incomplete: SprintPlanningTask[]; drafts: Record<string, string>; carry: Record<string, SprintCardCarry>; needsReviewVideo: boolean; reviewVideos: number }): SprintGaps {
  return sprintEndGaps({
    emptyInfoFields: emptySprintInfoFieldCount(opts.info, { includeReviewDate: true }),
    missingIncompleteReasons: opts.incomplete.filter((t) => reasonOf(t.id, opts.drafts, opts.carry) === "").length,
    missingReviewVideo: opts.needsReviewVideo && opts.reviewVideos === 0,
  });
}

/**
 * How many required fields the phase has in all, so the ring around Start or End knows how full
 * it is: before the start, the four schedule cells and each task's estimate, person, Decision
 * and Risk (no person for a client, who sees none); in the review, the five cells with the
 * review date, a reason per unfinished task, and the review video where one is required.
 */
export function requiredFieldCount(opts: { started: boolean; tasks: number; hideAssignees: boolean; incomplete: number; needsReviewVideo: boolean }): number {
  if (!opts.started) return 4 + opts.tasks * (opts.hideAssignees ? 3 : 4);
  return 5 + opts.incomplete + (opts.needsReviewVideo ? 1 : 0);
}

/** The reasons to send with End: every unfinished task's, typed or from the document. */
export function reasonsToSend(incomplete: SprintPlanningTask[], drafts: Record<string, string>, carry: Record<string, SprintCardCarry>): Record<string, string> {
  return Object.fromEntries(incomplete.flatMap((t) => (reasonOf(t.id, drafts, carry) ? [[t.id, reasonOf(t.id, drafts, carry)]] : [])));
}

/** A title cut to its first fifteen words, as the live card shows it. */
export function shortTitle(title: string): string {
  const words = title.split(/\s+/);
  return words.length > 15 ? `${words.slice(0, 15).join(" ")}…` : title;
}

/** "between 2 Nov 2026 and 12 Nov 2026 (11 days)", for the Start confirmation. */
export function sprintSpanText(startIso: string, endIso: string): { start: string; end: string; days: number } {
  const start = startIso ? formatPlanningDate(startIso) : "—";
  const end = endIso ? formatPlanningDate(endIso) : "—";
  const ms = startIso && endIso ? new Date(`${endIso}T00:00:00Z`).getTime() - new Date(`${startIso}T00:00:00Z`).getTime() : NaN;
  const days = Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000) + 1) : 0;
  return { start, end, days };
}
