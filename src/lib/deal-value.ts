/**
 * How a deal's optional value is shown.
 *
 * Stored as a decimal string with no currency — the team already knows which
 * one they invoice in — so this only groups thousands and keeps up to three
 * fraction digits (fils / baisa).
 */
export function formatDealValue(value: string | null | undefined): string {
  if (!value) return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-KW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(amount);
}
