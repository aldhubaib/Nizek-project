// Pure helpers for the Equity module — usable from both server and client.
// "Vested as of today" and ownership splits are always derived, never stored,
// so they can't go stale.

export const EQUITY_FREQUENCY = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
} as const;

/**
 * How a single equity grant is shaped:
 * - FIXED — one flat percentage.
 * - TRANCHED — the whole stake is granted non-diluted, and each tranche says
 *   how much of it starts diluting once the company reaches a valuation. A 20%
 *   stake might dilute 5% at 2M, another 5% at 4M and the last 10% at 6M, so
 *   the tranches always add up to the grant.
 * - DIVIDEND — a percentage that also pays out on a recurring schedule.
 */
export const EQUITY_STRUCTURE = {
  FIXED: "Fixed percentage",
  TRANCHED: "Valuation tranches",
  DIVIDEND: "Percentage with dividends",
} as const;

/** A tranched grant's total is the sum of its tranches, never hand-entered. */
export function sumTrancheEquity(tranches: { equityPct: number }[]): number {
  return tranches.reduce((sum, t) => sum + t.equityPct, 0);
}

export function equityLabel(
  map: Record<string, string>,
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}

export const EQUITY_LENGTH_UNIT = {
  MONTHS: "Months",
  YEARS: "Years",
} as const;

/** Term length in whole months, whichever unit it was entered in. */
export function lengthInMonths(
  lengthValue: number | null | undefined,
  lengthUnit: string | null | undefined,
): number | null {
  if (lengthValue == null || lengthValue <= 0) return null;
  return Math.round(lengthUnit === "MONTHS" ? lengthValue : lengthValue * 12);
}

/** "18 months" / "1 year" / "1.5 years" — for read-only display. */
export function formatContractLength(
  lengthValue: number | null | undefined,
  lengthUnit: string | null | undefined,
): string | null {
  if (lengthValue == null || lengthValue <= 0) return null;
  const unit = lengthUnit === "MONTHS" ? "month" : "year";
  return `${lengthValue} ${unit}${lengthValue === 1 ? "" : "s"}`;
}

/**
 * Contract end date, derived from its start date and term length. The day of
 * month is clamped so e.g. Aug 31 + 6 months lands on Feb 28, not Mar 3.
 */
export function computeContractEndDate(
  startDate: string | Date | null | undefined,
  lengthValue: number | null | undefined,
  lengthUnit: string | null | undefined,
): string | null {
  const months = lengthInMonths(lengthValue, lengthUnit);
  if (!startDate || months == null) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDayOfTarget));

  return target.toISOString().slice(0, 10);
}

/** Whole intervals (calendar months) elapsed between two dates. */
function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

/**
 * Vested equity as of `now`, matching the spreadsheet's math: the total vests
 * in equal steps per interval (month/quarter/year) across the vesting window.
 * e.g. 20% over 12 months, 7 full months in → 20 × 7/12 = 11.67%.
 */
export function computeVestedPct(opts: {
  totalEquityPct: number | null;
  vestingStartDate: string | Date | null;
  vestingEndDate: string | Date | null;
  vestingFrequency: string | null;
  now?: Date;
}): number | null {
  const { totalEquityPct, vestingStartDate, vestingEndDate, vestingFrequency } = opts;
  if (totalEquityPct == null || !vestingStartDate || !vestingEndDate) return null;

  const start = new Date(vestingStartDate);
  const end = new Date(vestingEndDate);
  const now = opts.now ?? new Date();
  if (end <= start) return null;
  if (now <= start) return 0;
  if (now >= end) return totalEquityPct;

  const intervalMonths = vestingFrequency === "YEARLY" ? 12 : vestingFrequency === "QUARTERLY" ? 3 : 1;
  const totalIntervals = Math.max(1, Math.round(monthsBetween(start, end) / intervalMonths));
  const elapsedIntervals = Math.min(
    totalIntervals,
    Math.floor(monthsBetween(start, now) / intervalMonths),
  );

  return (totalEquityPct * elapsedIntervals) / totalIntervals;
}

/**
 * A portfolio's position, rolled up from its equity entries: each entry's stake
 * vests across the term of the contract it sits under. Nothing is read from the
 * portfolio row itself, so the totals always match what the entries say.
 */
export function computePortfolioEquity(portfolio: {
  contracts: { id: string; startDate: string | null; endDate: string | null }[];
  grants: { equityPct: number; contractId: string | null }[];
}): { granted: number | null; vested: number | null } {
  if (portfolio.grants.length === 0) return { granted: null, vested: null };

  let granted = 0;
  let vested = 0;
  for (const grant of portfolio.grants) {
    granted += grant.equityPct;
    const contract = portfolio.contracts.find((c) => c.id === grant.contractId);
    vested +=
      computeVestedPct({
        totalEquityPct: grant.equityPct,
        vestingStartDate: contract?.startDate ?? null,
        vestingEndDate: contract?.endDate ?? null,
        vestingFrequency: null,
      }) ?? 0;
  }
  return { granted, vested };
}

/** Keeps up to 3 decimals so precise stakes (19.877%) survive, with no padding. */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 1000) / 1000}%`;
}

export function formatValuation(value: number | null | undefined, currency: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} ${currency}`;
}

export type ValuationEntry = { valuedAt: string; amount: number };

/**
 * The valuation that was current on `asOf` — the newest one dated on or before
 * it. Future-dated entries are ignored so a planned round doesn't get read as
 * today's number. Callers can't assume input order, so this sorts its own copy.
 */
export function valuationAsOf(
  valuations: ValuationEntry[],
  asOf: Date = new Date(),
): ValuationEntry | null {
  const eligible = valuations
    .filter((v) => new Date(v.valuedAt).getTime() <= asOf.getTime())
    .sort((a, b) => new Date(b.valuedAt).getTime() - new Date(a.valuedAt).getTime());
  return eligible[0] ?? null;
}

/** Change from one valuation to the next, as a percentage. */
export function valuationChangePct(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** A tranche starts diluting once the company is worth at least its threshold. */
export function isTrancheDiluted(
  startsAtValuation: number,
  currentValuation: number | null | undefined,
): boolean {
  if (currentValuation == null) return false;
  return currentValuation >= startsAtValuation;
}

/**
 * Splits a tranched grant at the current valuation: how much of the stake has
 * started diluting, and how much is still protected. With nothing on record the
 * company hasn't been valued yet, so no tranche has been triggered.
 */
export function splitTranchesByDilution(
  tranches: { equityPct: number; startsAtValuation: number }[],
  currentValuation: number | null | undefined,
): { diluted: number; nonDiluted: number } {
  let diluted = 0;
  let nonDiluted = 0;
  for (const tranche of tranches) {
    if (isTrancheDiluted(tranche.startsAtValuation, currentValuation)) {
      diluted += tranche.equityPct;
    } else {
      nonDiluted += tranche.equityPct;
    }
  }
  return { diluted, nonDiluted };
}

/** A stake's worth at a given valuation — e.g. 20% of 2,000,000. */
export function equityValueAt(
  equityPct: number | null | undefined,
  valuation: number | null | undefined,
): number | null {
  if (equityPct == null || valuation == null) return null;
  return (equityPct / 100) * valuation;
}
