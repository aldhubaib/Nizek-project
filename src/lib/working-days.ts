export const MAX_WORKING_DAYS = 10_000;

/** Empty → null. Otherwise a whole number ≥ 1. */
export function parseWorkingDays(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_WORKING_DAYS) {
    throw new Error("Working days must be a whole number of at least 1.");
  }
  return n;
}

export function formatWorkingDays(n: number): string {
  return n === 1 ? "1 working day" : `${n} working days`;
}
