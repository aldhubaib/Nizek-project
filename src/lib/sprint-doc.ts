/**
 * The sprint document: one note per sprint, written in two halves.
 *
 * The plan half is what the team committed to. It is written while the sprint
 * is still being planned and freezes the moment it starts, because a promise
 * that quietly rewrites itself is not a promise.
 *
 * The outcome half appears once the sprint is running and keeps up with it —
 * which tasks landed, which did not, and why — until the sprint closes and it
 * freezes too. Rebuilding it must never disturb the plan above it, so the two
 * are separated by a sprintOutcome node and every function here works on one
 * side of that line.
 */

import {
  escapeHtml,
  formatPlanningDate,
  planningDateIso,
  planningInfoFromHtml,
  planningTasksFromHtml,
  sprintPlanningDocHtml,
  sprintTaskNodeHtml,
  stripSprintDocKind,
  stripSprintItemList,
  unescapeHtml,
  withPlanningInfo,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";

/** Written into new documents; the editor re-renders it with its own attributes. */
export const SPRINT_OUTCOME_MARKER = `<div data-type="sprint-outcome"></div>`;

/** Matches the marker however the editor happened to serialise it. */
const SPRINT_OUTCOME_RE = /<div[^>]*data-type="sprint-outcome"[^>]*>(?:\s*<\/div>)?/i;

/**
 * The marker, carrying the tasks the sprint was started with.
 *
 * The plan's item list is folded away once the outcome lists the same tasks, so
 * the commitment has to survive somewhere: a task removed from the sprint after
 * it started is gone from the sprint, and this is the only remaining record
 * that it was ever promised.
 */
function sprintOutcomeMarkerHtml(committed: SprintPlanningTask[]): string {
  if (committed.length === 0) return SPRINT_OUTCOME_MARKER;
  return `<div data-type="sprint-outcome" data-committed="${escapeHtml(
    JSON.stringify(committed),
  )}"></div>`;
}

function committedFromMarker(html: string): SprintPlanningTask[] | null {
  const marker = html.match(SPRINT_OUTCOME_RE)?.[0];
  const raw = marker?.match(/\sdata-committed="([^"]*)"/i)?.[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(unescapeHtml(raw)) as SprintPlanningTask[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * What the sprint was started with, wherever this document keeps it: on the
 * marker once the plan's list has been folded away, and in the plan's own task
 * rows before that.
 */
export function committedSprintTasks(html: string): SprintPlanningTask[] {
  return committedFromMarker(html) ?? planningTasksFromHtml(splitSprintDoc(html).plan);
}

export type SprintScopeChanges = {
  /** In the sprint now, never in the plan. */
  added: SprintPlanningTask[];
  /** In the plan, no longer in the sprint. */
  removed: SprintPlanningTask[];
};

/**
 * How the sprint's contents have drifted from what the document committed to.
 *
 * Only meaningful once the sprint has started: before that the document is kept
 * in step with the sprint by syncPlanningDocTasks, so the diff is always empty.
 */
export function sprintScopeChanges(
  html: string,
  liveTasks: SprintPlanningTask[],
): SprintScopeChanges {
  return scopeChangesFrom(committedSprintTasks(html), liveTasks);
}

/**
 * The same diff, for callers holding the committed list rather than the HTML —
 * the open editor reads it off the outcome node it is already walking.
 */
export function scopeChangesFrom(
  committed: SprintPlanningTask[] | null,
  liveTasks: SprintPlanningTask[],
): SprintScopeChanges {
  // A document that never recorded what its sprint started with has nothing to
  // be compared against, and calling every task an addition would be worse than
  // saying nothing. Each task's own flag knows it was pulled in late; nothing
  // outside the document remembers what left, so that side stays quiet.
  if (!committed || committed.length === 0) {
    return { added: liveTasks.filter((task) => task.unplanned), removed: [] };
  }
  const committedIds = new Set(committed.map((task) => task.id));
  const liveIds = new Set(liveTasks.map((task) => task.id));
  return {
    added: liveTasks.filter((task) => !committedIds.has(task.id)),
    removed: committed.filter((task) => !liveIds.has(task.id)),
  };
}

/**
 * Collapse the plan's item list into the outcome, which lists the same tasks.
 *
 * Documents written before the two halves were merged carry both lists, and a
 * closed sprint's document is never rebuilt — so the fold happens on read as
 * well as on write, and has to be safe to run on a document already folded.
 */
export function foldSprintItemList(html: string): string {
  const { plan, outcome } = splitSprintDoc(html);
  if (outcome === null) return html;
  const committed = committedSprintTasks(html);
  return `${stripSprintItemList(plan)}${sprintOutcomeMarkerHtml(committed)}${outcome}`;
}

/**
 * The outcome's headings, grouped by where the work came from rather than how
 * it ended.
 *
 * Grouping by fate alone put a task added mid-sprint in two places at once —
 * once among the incomplete items and again in the list of additions — so the
 * first question the document answers is whether the work was promised, and
 * only then whether it landed. Every task has exactly one home.
 */
export const COMMITTED_HEADING = "Committed work";
export const ADDED_HEADING = "Added after the sprint started";
export const COMPLETED_SUBHEADING = "Completed";
export const INCOMPLETE_SUBHEADING = "Not completed";
export const REMOVED_HEADING = "Removed after the sprint started";

export const COMMITTED_BLURB =
  "The work agreed before the sprint started. These items were reviewed, prioritised, and committed to by the team as the scope of this sprint.";
export const ADDED_BLURB =
  "Work brought into the sprint after it had started, which was not part of the agreed scope. By changing the scope of a running sprint, the team is not held responsible for any delay it causes.";
export const REMOVED_BLURB =
  "Work taken out of the sprint after it had started. It was part of the agreed scope and is no longer part of this sprint.";

/** Headings the generator owns, so a rebuild knows what is its to replace. */
export const OUTCOME_HEADINGS = [
  COMMITTED_HEADING,
  ADDED_HEADING,
  REMOVED_HEADING,
  COMPLETED_SUBHEADING,
  INCOMPLETE_SUBHEADING,
  // Written by the version that grouped by fate alone. Recognised so those
  // documents can be lifted into the new shape rather than growing a second
  // set of headings beside the first.
  "Completed Sprint Items",
  "Incomplete / Deferred Items",
];

/** Blurbs and placeholders the generator owns, matched on their opening words. */
export const OUTCOME_PROSE_PREFIXES = [
  COMMITTED_BLURB.slice(0, 40),
  ADDED_BLURB.slice(0, 40),
  REMOVED_BLURB.slice(0, 40),
  "The following items were successfully completed",
  "The following items were not completed within the sprint",
  "No completed items in this sprint",
  "No incomplete items in this sprint",
];

/** The document's two halves. `outcome` is null before the sprint starts. */
export function splitSprintDoc(html: string): { plan: string; outcome: string | null } {
  const match = html.match(SPRINT_OUTCOME_RE);
  if (!match || match.index == null) return { plan: html, outcome: null };
  return {
    plan: html.slice(0, match.index),
    outcome: html.slice(match.index + match[0].length),
  };
}

export function sprintDocHasOutcome(html: string): boolean {
  return SPRINT_OUTCOME_RE.test(html);
}

/** What a card carries that the sprint itself cannot supply: typed-in answers. */
export type SprintCardCarry = {
  incompleteReason?: string;
  description?: string;
  descriptionImages?: string[];
};

/** Whether a task was pulled in after the team had committed to the sprint. */
export function isAddedTask(
  task: SprintPlanningTask,
  committedIds: Set<string>,
): boolean {
  // No committed list means the document never recorded what it started with,
  // and calling every task an addition would be worse than trusting the flag
  // each task carries about itself.
  if (committedIds.size === 0) return Boolean(task.unplanned);
  return !committedIds.has(task.id);
}

function cardHtml(
  task: SprintPlanningTask,
  done: boolean,
  carry: SprintCardCarry | undefined,
): string {
  return sprintTaskNodeHtml(task, {
    variant: done ? "completed" : "incomplete",
    showQuestions: true,
    incompleteReason: carry?.incompleteReason ?? "",
    description: carry?.description ?? "",
    descriptionImages: carry?.descriptionImages ?? [],
  });
}

function bucketHtml(
  heading: string,
  tasks: SprintPlanningTask[],
  done: boolean,
  carryById: Record<string, SprintCardCarry>,
): string {
  // An empty bucket prints nothing at all. A sprint that went to plan then
  // reads as a short document rather than one padded with headings saying
  // nothing happened under them.
  if (tasks.length === 0) return "";
  return (
    `<h3>${heading}</h3>` +
    tasks.map((task) => cardHtml(task, done, carryById[task.id])).join("")
  );
}

function groupHtml(
  heading: string,
  blurb: string,
  completed: SprintPlanningTask[],
  incomplete: SprintPlanningTask[],
  carryById: Record<string, SprintCardCarry>,
): string {
  if (completed.length === 0 && incomplete.length === 0) return "";
  return (
    `<h2>${heading}</h2><p>${blurb}</p>` +
    bucketHtml(COMPLETED_SUBHEADING, completed, true, carryById) +
    bucketHtml(INCOMPLETE_SUBHEADING, incomplete, false, carryById)
  );
}

/** Everything below the marker: how the sprint actually went. */
export function sprintOutcomeSectionsHtml(
  completed: SprintPlanningTask[],
  incomplete: SprintPlanningTask[],
  carryById: Record<string, SprintCardCarry> = {},
  committed: SprintPlanningTask[] = [],
): string {
  const committedIds = new Set(committed.map((task) => task.id));
  const split = (tasks: SprintPlanningTask[]) => ({
    kept: tasks.filter((task) => !isAddedTask(task, committedIds)),
    added: tasks.filter((task) => isAddedTask(task, committedIds)),
  });
  const done = split(completed);
  const open = split(incomplete);

  return (
    groupHtml(COMMITTED_HEADING, COMMITTED_BLURB, done.kept, open.kept, carryById) +
    groupHtml(ADDED_HEADING, ADDED_BLURB, done.added, open.added, carryById)
  );
}

/**
 * The record of what left the sprint, written into the document when it closes.
 *
 * Kept out of the live document on purpose: while the sprint runs this list
 * moves with every drag and nothing in it is typed into the page, so it is
 * shown as a panel and only becomes part of the document once it has stopped
 * changing. See the note on materialisation in completeSprint.
 */
export function sprintRemovedSectionHtml(removed: SprintRemovedTask[]): string {
  if (removed.length === 0) return "";
  return (
    `<h2>${REMOVED_HEADING}</h2><p>${REMOVED_BLURB}</p>` +
    removed
      .map((entry) =>
        sprintTaskNodeHtml(entry.task, {
          variant: "removed",
          showQuestions: true,
          incompleteReason: entry.reason,
          movedTo: entry.movedTo,
        }),
      )
      .join("")
  );
}

export type SprintRemovedTask = {
  task: SprintPlanningTask;
  /** Why it was taken out, as typed by whoever moved it. */
  reason: string;
  /** The sprint it went to, when it was handed on rather than dropped. */
  movedTo?: string | null;
  /** Whether it had already been finished when it left. */
  wasCompleted?: boolean;
};

/**
 * Everything typed into the cards, keyed by task.
 *
 * Rebuilding the outcome throws its cards away and writes new ones, so the
 * answers people put into them have to be lifted out first. The sprint knows
 * which tasks it holds; only the document knows what was written about them.
 */
export function sprintCardCarryFromHtml(html: string): Record<string, SprintCardCarry> {
  const carry: Record<string, SprintCardCarry> = {};
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const id =
      tag.match(/\sdata-id="([^"]*)"/i)?.[1] ??
      (() => {
        const raw = tag.match(/\sdata-task="([^"]*)"/i)?.[1];
        if (!raw) return null;
        try {
          return (JSON.parse(unescapeHtml(raw)) as { id?: string }).id ?? null;
        } catch {
          return null;
        }
      })();
    if (!id) continue;
    const reason = unescapeHtml(tag.match(/\sdata-incomplete-reason="([^"]*)"/i)?.[1] ?? "");
    const description = unescapeHtml(tag.match(/\sdata-description="([^"]*)"/i)?.[1] ?? "");
    let images: string[] = [];
    const rawImages = tag.match(/\sdata-description-images="([^"]*)"/i)?.[1];
    if (rawImages) {
      try {
        const parsed = JSON.parse(unescapeHtml(rawImages)) as unknown;
        if (Array.isArray(parsed)) images = parsed as string[];
      } catch {
        /* A card whose images cannot be read still keeps its text. */
      }
    }
    const existing = carry[id] ?? {};
    carry[id] = {
      incompleteReason: reason || existing.incompleteReason,
      description: description || existing.description,
      descriptionImages: images.length > 0 ? images : existing.descriptionImages,
    };
  }
  return carry;
}

/**
 * Bring the outcome half in step with the sprint, adding it if this is the
 * first time the document has been opened since the sprint started.
 *
 * The plan half is returned byte for byte as it came in. Callers must stop
 * invoking this once the sprint closes: from then on the outcome is a record
 * too, and the reasons typed into it are the ones that were agreed.
 */
export function syncSprintDocOutcome(
  html: string,
  completed: SprintPlanningTask[],
  incomplete: SprintPlanningTask[],
  carryById: Record<string, SprintCardCarry> = {},
): string {
  const { plan } = splitSprintDoc(html);
  const committed = committedSprintTasks(html);
  const sections = sprintOutcomeSectionsHtml(completed, incomplete, carryById, committed);
  return `${stripSprintItemList(plan)}${sprintOutcomeMarkerHtml(committed)}${sections}`;
}

/** A brand new sprint document: the plan, with no outcome yet. */
export function sprintDocHtml(
  tasks: SprintPlanningTask[],
  info: SprintPlanningInfo,
): string {
  return sprintPlanningDocHtml(tasks, info);
}

/**
 * Fill in the review date if the document has none.
 *
 * Documents merged from a separate plan and review have the plan's date only,
 * since one note can hold one date column. Anything opened after the sprint
 * starts gets the missing half filled in rather than showing a blank row.
 */
export function withSprintReviewDate(html: string, iso: string | null): string {
  if (!iso) return html;
  if (planningInfoFromHtml(html)?.reviewDateIso) return html;
  const date = planningDateIso(iso);
  return withPlanningInfo(html, {
    reviewDateIso: date,
    reviewDate: formatPlanningDate(date),
  });
}

/** One document, so one name: "Sprint 16", not "Sprint 16 planning". */
export function sprintDocName(name: string): string {
  return stripSprintDocKind(name) || name.trim();
}
