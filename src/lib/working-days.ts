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
