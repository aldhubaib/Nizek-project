/**
 * What a card's due date means right now.
 *
 * One module because three places ask the same question and must not disagree:
 * the badge on the card front, the Due date section of the filter, and the
 * picker itself. A badge saying "overdue" on a card the filter would not return
 * under "Overdue" is the kind of drift this avoids.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type DueState =
  /** Ticked off. Nothing about the clock matters any more. */
  | "done"
  /** The moment has passed and nobody ticked it. */
  | "overdue"
  /** Inside the next 24 hours. */
  | "soon"
  /** Further out than that. */
  | "later";

export interface CardDates {
  dueDate: Date | string | null;
  dueDone: boolean;
}

/**
 * The last instant a card is still on time.
 *
 * A due date is a day, not a moment, so it does not run out until the day does.
 * Reading the stored midnight literally would mark everything due today as
 * overdue from the moment the day began.
 */
export function dueDeadline(value: Date | string): number {
  const date = new Date(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

export function dueState(card: CardDates, now: number = Date.now()): DueState | null {
  if (!card.dueDate) return null;
  if (card.dueDone) return "done";
  const deadline = dueDeadline(card.dueDate);
  if (deadline <= now) return "overdue";
  return deadline - now <= DAY_MS ? "soon" : "later";
}

/** How a due date is written on a card: the day, and the year if it is not this one. */
export function formatDue(value: Date | string): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// ─── <input> plumbing ────────────────────────────────────────────────────────
//
// `type="date"` speaks local wall-clock strings and cannot be handed a Date.
// These convert in both directions without going via UTC, which would shift the
// day either side of midnight for anyone not on GMT.

export function toDateInput(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A date field back into an instant: midnight local time on the day chosen. */
export function fromDateInput(day: string): Date | null {
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  return new Date(year, month - 1, date, 0, 0, 0, 0);
}
