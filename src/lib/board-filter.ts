/**
 * Narrowing what a board shows.
 *
 * Every rule here reads a card the board has already loaded — filtering is a
 * client-side pass over `BoardDTO.cards` rather than a query, because the whole
 * board is in memory anyway and a round trip per keystroke would be worse than
 * the work it saves.
 *
 * The sections mirror what this board actually holds. There is no label or due
 * date filter because the board has neither; card type is what plays the part a
 * label plays elsewhere, and `isComplete` — every required field answered — is
 * the only sense in which a card here is finished.
 */

import { dueDeadline, dueState } from "@/lib/board-dates";
import type { BoardCardDTO } from "@/actions/board";

/** Stands in for "nobody", which is not a member id. */
export const UNASSIGNED = "none";

/** Stands in for "no labels at all", which is not a label id. */
export const UNLABELLED = "none";

export type ActivityWindow = "week" | "two-weeks" | "four-weeks" | "stale";

export type DueFilter = "none" | "overdue" | "day" | "week" | "month" | "done";

export const DUE_FILTERS: { id: DueFilter; label: string }[] = [
  { id: "none", label: "No due date" },
  { id: "overdue", label: "Overdue" },
  { id: "day", label: "Due in the next day" },
  { id: "week", label: "Due in the next week" },
  { id: "month", label: "Due in the next month" },
  { id: "done", label: "Marked as done" },
];

export const ACTIVITY_WINDOWS: { id: ActivityWindow; label: string }[] = [
  { id: "week", label: "Active in the last week" },
  { id: "two-weeks", label: "Active in the last two weeks" },
  { id: "four-weeks", label: "Active in the last four weeks" },
  { id: "stale", label: "Without activity in the last four weeks" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const WINDOW_DAYS: Record<Exclude<ActivityWindow, "stale">, number> = {
  week: 7,
  "two-weeks": 14,
  "four-weeks": 28,
};

export interface BoardFilter {
  keyword: string;
  /** Member ids, plus UNASSIGNED for cards with nobody on them. */
  assignees: string[];
  cardTypes: string[];
  /** Label ids, plus UNLABELLED for cards carrying none. */
  labels: string[];
  /** "complete" and "incomplete", by whether required fields are answered. */
  statuses: string[];
  due: DueFilter[];
  activity: ActivityWindow[];
  /**
   * How the sections combine. Within a section the choices are alternatives;
   * this decides whether a card must satisfy every section that has a choice in
   * it, or merely one of them.
   */
  mode: "any" | "all";
  /** Hide columns that no longer have anything in them. */
  collapseEmpty: boolean;
}

export const EMPTY_FILTER: BoardFilter = {
  keyword: "",
  assignees: [],
  cardTypes: [],
  labels: [],
  statuses: [],
  due: [],
  activity: [],
  mode: "any",
  collapseEmpty: false,
};

/** Whether this filter would narrow anything, and so is worth applying. */
export function isFilterActive(filter: BoardFilter): boolean {
  return (
    filter.keyword.trim().length > 0 ||
    filter.assignees.length > 0 ||
    filter.cardTypes.length > 0 ||
    filter.labels.length > 0 ||
    filter.statuses.length > 0 ||
    filter.due.length > 0 ||
    filter.activity.length > 0
  );
}

/** How many choices are on, for the badge on the Filter button. */
export function activeFilterCount(filter: BoardFilter): number {
  return (
    (filter.keyword.trim() ? 1 : 0) +
    filter.assignees.length +
    filter.cardTypes.length +
    filter.labels.length +
    filter.statuses.length +
    filter.due.length +
    filter.activity.length
  );
}

function matchesKeyword(card: BoardCardDTO, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  // The number is searchable with or without its hash, since that is how it is
  // written on the card.
  const haystack = [
    card.title,
    card.description ?? "",
    `#${card.cardNumber}`,
    String(card.cardNumber),
    card.assignee?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesActivity(
  card: BoardCardDTO,
  windows: ActivityWindow[],
  now: number,
): boolean {
  const age = now - new Date(card.updatedAt).getTime();
  return windows.some((window) =>
    window === "stale"
      ? age > WINDOW_DAYS["four-weeks"] * DAY_MS
      : age <= WINDOW_DAYS[window] * DAY_MS,
  );
}

const DUE_HORIZON_DAYS: Record<"day" | "week" | "month", number> = {
  day: 1,
  week: 7,
  month: 30,
};

/**
 * "Due in the next week" means between now and a week from now, and so does not
 * include a card that was due yesterday — that one is Overdue, which is its own
 * choice. Overlapping the two would make "Overdue" impossible to read off.
 */
function matchesDue(card: BoardCardDTO, choices: DueFilter[], now: number): boolean {
  const state = dueState(card, now);
  return choices.some((choice) => {
    if (choice === "none") return card.dueDate === null;
    if (choice === "overdue") return state === "overdue";
    if (choice === "done") return state === "done";
    if (!card.dueDate || card.dueDone) return false;
    // The end of the due day, so "Due today" catches a card due today rather
    // than only one due later today.
    const deadline = dueDeadline(card.dueDate);
    return deadline >= now && deadline - now <= DUE_HORIZON_DAYS[choice] * DAY_MS;
  });
}

/**
 * Apply a filter to one card.
 *
 * The keyword narrows regardless of the match mode. A search box that widened
 * the results as you typed into it would be a surprise, whatever the mode says
 * about the checkbox sections below it.
 */
export function cardMatchesFilter(
  card: BoardCardDTO,
  filter: BoardFilter,
  now: number = Date.now(),
): boolean {
  if (!matchesKeyword(card, filter.keyword)) return false;

  const sections: boolean[] = [];
  if (filter.assignees.length > 0) {
    sections.push(
      filter.assignees.includes(card.assignee?.id ?? UNASSIGNED),
    );
  }
  if (filter.cardTypes.length > 0) {
    sections.push(filter.cardTypes.includes(card.cardTypeId));
  }
  if (filter.labels.length > 0) {
    sections.push(
      filter.labels.some((choice) =>
        choice === UNLABELLED
          ? card.labelIds.length === 0
          : card.labelIds.includes(choice),
      ),
    );
  }
  if (filter.statuses.length > 0) {
    sections.push(
      filter.statuses.includes(card.isComplete ? "complete" : "incomplete"),
    );
  }
  if (filter.due.length > 0) {
    sections.push(matchesDue(card, filter.due, now));
  }
  if (filter.activity.length > 0) {
    sections.push(matchesActivity(card, filter.activity, now));
  }

  if (sections.length === 0) return true;
  return filter.mode === "all"
    ? sections.every(Boolean)
    : sections.some(Boolean);
}

/** Toggle one choice in one of the list-shaped sections. */
export function toggleChoice<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}
