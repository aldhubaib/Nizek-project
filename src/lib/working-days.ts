export const MAX_WORKING_DAYS = 10_000;

/** Kuwait / GCC weekend is Friday–Saturday. */
const WEEKEND_DAYS = new Set([5, 6]);

/** Empty → null. Otherwise a whole number ≥ 1. */
export function parseWorkingDays(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_WORKING_DAYS) {
    throw new Error("Efforts must be a whole number of at least 1.");
  }
  return n;
}

export function formatWorkingDays(n: number): string {
  return n === 1 ? "1 effort" : `${n} efforts`;
}

/** Inclusive working days between two calendar dates (skips Fri–Sat). */
export function countWorkingDays(from: Date | string, to: Date | string): number {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  if (end < start) return 0;
  let n = 0;
  const d = new Date(start);
  while (d <= end) {
    if (!WEEKEND_DAYS.has(d.getDay())) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/** Inclusive end date after `days` working days from `from` (skips Fri–Sat). */
export function endDateForWorkingDays(from: Date | string, days: number): string {
  if (!Number.isInteger(days) || days < 1 || days > MAX_WORKING_DAYS) {
    throw new Error("Working days must be a whole number of at least 1.");
  }
  const start =
    typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? parseDateInputValue(from)
      : startOfLocalDay(from);
  const end = new Date(start);
  while (countWorkingDays(start, end) < days) {
    end.setDate(end.getDate() + 1);
  }
  return toDateInputValue(end);
}

/** Due date = N working days after `from` (skipping Fri–Sat), at 17:00 local. */
export function addWorkingDays(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 1 || days > MAX_WORKING_DAYS) {
    throw new Error("Efforts must be a whole number of at least 1.");
  }
  const result = new Date(from);
  result.setHours(17, 0, 0, 0);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!WEEKEND_DAYS.has(result.getDay())) remaining -= 1;
  }
  return result;
}

export function toDateInputValue(value: Date | string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local calendar day at 00:00 — the date a roadmap item was dragged to In Progress. */
export function startOfLocalDay(value: Date | string = new Date()): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse an `<input type="date">` value as a local calendar day. */
export function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid date");
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}
