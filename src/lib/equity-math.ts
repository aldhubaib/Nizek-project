// Pure helpers for the Equity module — usable from both server and client.
// "Vested as of today" and ownership splits are always derived, never stored,
// so they can't go stale.

/**
 * How a single equity grant is shaped:
 * - FIXED — one flat percentage, diluted like everyone else's.
 * - TRANCHED ("Protected") — the stake is held non-diluted until the company
 *   reaches the valuation on it, and only starts diluting from there.
 */
export const EQUITY_STRUCTURE = {
  FIXED: "Fixed",
  TRANCHED: "Protected",
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
  ONGOING: "Ongoing",
} as const;

/**
 * An engagement with no end: we hold the tech indefinitely rather than handing
 * it over on a date. Two things follow, and both are derived from this alone so
 * they can't be set inconsistently — there's no recurring fee to hand over to,
 * and no term to vest across, so the stake is held outright from day one.
 */
export function isOngoing(lengthUnit: string | null | undefined): boolean {
  return lengthUnit === "ONGOING";
}

/** Term length in whole months, whichever unit it was entered in. */
export function lengthInMonths(
  lengthValue: number | null | undefined,
  lengthUnit: string | null | undefined,
): number | null {
  if (isOngoing(lengthUnit)) return null;
  if (lengthValue == null || lengthValue <= 0) return null;
  return Math.round(lengthUnit === "MONTHS" ? lengthValue : lengthValue * 12);
}

/** "18 months" / "1 year" / "1.5 years" / "Ongoing" — for read-only display. */
export function formatContractLength(
  lengthValue: number | null | undefined,
  lengthUnit: string | null | undefined,
): string | null {
  if (isOngoing(lengthUnit)) return EQUITY_LENGTH_UNIT.ONGOING;
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

// Financial reports used to be one figure per quarter, and had a small period
// model here — EQUITY_PERIOD_TYPE, periodStartFor, quarterOf, formatPeriodLabel.
// A report is now a pack of monthly figures, dated by when it was received, so
// the quarter has nothing left to name. Month and pack labels live in
// equity-financials.ts, beside the resolver that reads them.

/**
 * What a tracked field holds. The type is picked once, when the field is
 * defined, and everything after it follows: which input the form shows, which
 * column the value is stored in, and how it reads back.
 */
export const EQUITY_METRIC_TYPE = {
  NUMBER: "Number",
  PERCENT: "Percentage",
  DATE: "Date",
  FORMULA: "Calculated",
} as const;

export type EquityMetricType = keyof typeof EQUITY_METRIC_TYPE;

/** Which module a field belongs to — a dated reading, or a closed period. */
export const EQUITY_METRIC_GROUP = {
  PERFORMANCE: "Performance",
  FINANCIAL: "Financials",
} as const;

export type EquityMetricGroup = keyof typeof EQUITY_METRIC_GROUP;

/** What a calculated field does with its two operands, written as it reads. */
export const EQUITY_FORMULA_OP = {
  ADD: "+",
  SUBTRACT: "−",
  MULTIPLY: "×",
  DIVIDE: "÷",
} as const;

export type EquityFormulaOp = keyof typeof EQUITY_FORMULA_OP;

/** Dates and figures aren't interchangeable, and only this tells them apart. */
export function isDateMetric(type: string | null | undefined): boolean {
  return type === "DATE";
}

/** A calculated field is read, never entered — no input, no stored value. */
export function isFormulaMetric(type: string | null | undefined): boolean {
  return type === "FORMULA";
}

/**
 * Whether a field a project must report has actually been answered.
 *
 * Zero is an answer: a quarter that took nothing in is a fact about the
 * quarter, and a company that spent nothing has a burn of nought. Blank is not
 * an answer, and the difference between the two is the whole of the rule — a
 * form that accepted an empty box would turn "we didn't ask" into "it was
 * nothing", which is the one thing a report can't be allowed to say by
 * accident.
 *
 * Used by the form to decide what to block on and by the action to decide what
 * to refuse, so the two can't drift into disagreeing about what counts.
 */
export function isFieldAnswered(
  metric: { type: string },
  value:
    | { numberValue?: number | null; dateValue?: string | Date | null }
    | null
    | undefined,
): boolean {
  if (!value) return false;
  if (isDateMetric(metric.type)) return !!value.dateValue;
  return value.numberValue != null;
}

/**
 * A calculated field's value for one entry, from the two fields it stands on.
 *
 * Null wherever the answer would be a guess: an operand missing, or a division
 * by nothing. Worked out at read time rather than stored, so it can never
 * disagree with the figures it came from.
 */
export function evaluateFormula(
  op: string | null | undefined,
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (left == null || right == null) return null;
  switch (op) {
    case "ADD":
      return left + right;
    case "SUBTRACT":
      return left - right;
    case "MULTIPLY":
      return left * right;
    case "DIVIDE":
      return right === 0 ? null : left / right;
    default:
      return null;
  }
}

/** "Cash in bank ÷ Burn", for a form that has to explain itself. */
export function formulaLabel(
  op: string | null | undefined,
  leftName: string | null | undefined,
  rightName: string | null | undefined,
): string | null {
  const symbol = EQUITY_FORMULA_OP[op as EquityFormulaOp];
  if (!symbol || !leftName || !rightName) return null;
  return `${leftName} ${symbol} ${rightName}`;
}

/** One reading, as the line it should read as. */
export function formatMetricValue(
  metric: { type: string; unit?: string | null },
  value: { numberValue?: number | null; dateValue?: string | Date | null },
): string {
  if (isDateMetric(metric.type)) {
    if (!value.dateValue) return "—";
    const date = new Date(value.dateValue);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  }
  if (value.numberValue == null) return "—";
  const number = value.numberValue.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  if (metric.type === "PERCENT") return `${number}%`;
  return metric.unit ? `${number} ${metric.unit}` : number;
}

export const FEE_STATUS = {
  ESTIMATED: "Estimated",
  ACTUAL: "Actual",
  NONE: "No fee",
} as const;

export type FeeStatus = keyof typeof FEE_STATUS;

/**
 * Whether a contract's monthly fee is being collected yet. The startup pays for
 * its own team once the term is over, so an expired contract is billing and a
 * running one is only a projection. Derived from the term rather than stored,
 * so extending a contract moves the switchover with it.
 *
 * An ongoing engagement never hands the tech over, so there's no point at which
 * the startup picks up the bill — it reads as no fee rather than a projection
 * that would otherwise sit at "Estimated" forever.
 */
export function feeStatus(
  contract: { endDate?: string | Date | null; lengthUnit?: string | null },
  asOf: Date = new Date(),
): FeeStatus {
  if (isOngoing(contract.lengthUnit)) return "NONE";
  if (!contract.endDate) return "ESTIMATED";
  const end = new Date(contract.endDate);
  if (Number.isNaN(end.getTime())) return "ESTIMATED";
  return end.getTime() <= asOf.getTime() ? "ACTUAL" : "ESTIMATED";
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

export type VestingContract = {
  startDate?: string | null;
  endDate?: string | null;
  lengthUnit?: string | null;
};

/**
 * Vested equity for a single grant under its contract, which is the only place
 * that decides what vesting means. An ongoing engagement has no term to spread
 * the stake across: it's held outright from the start, so it counts as fully
 * vested rather than never vesting at all.
 */
export function vestedForGrant(
  equityPct: number | null | undefined,
  contract: VestingContract | null | undefined,
  now?: Date,
): number | null {
  if (equityPct == null) return null;
  if (isOngoing(contract?.lengthUnit)) return equityPct;
  return computeVestedPct({
    totalEquityPct: equityPct,
    vestingStartDate: contract?.startDate ?? null,
    vestingEndDate: contract?.endDate ?? null,
    vestingFrequency: null,
    now,
  });
}

/**
 * Our position in a project, read off its dated splits: what the first one gave
 * us, what the latest one leaves us with, and how much of that has vested.
 *
 * Granted and held are separate figures because a later split can restate the
 * cap table — the difference between them is the dilution. Vesting is measured
 * against what we hold rather than what we were granted, so a diluted stake
 * doesn't keep vesting toward a share we no longer have. Each row vests across
 * the term of the contract it sits under; nothing is read from the portfolio
 * row itself, so the totals always match what the splits say.
 */
export function computePortfolioEquity(
  portfolio: {
    contracts: {
      id: string;
      startDate: string | null;
      endDate: string | null;
      lengthUnit?: string | null;
    }[];
    sets: SetEntry[];
  },
  asOf: Date = new Date(),
): { granted: number | null; held: number | null; vested: number | null } {
  const granted = ourPctIn(originalSet(portfolio.sets));
  const latest = currentSet(portfolio.sets, asOf);
  const held = ourPctIn(latest);

  if (granted == null && held == null) return { granted: null, held: null, vested: null };

  let vested: number | null = null;
  if (latest) {
    vested = 0;
    for (const grant of ourGrants(latest.grants)) {
      const contract = portfolio.contracts.find((c) => c.id === grant.contractId);
      vested += vestedForGrant(grant.equityPct, contract) ?? 0;
    }
  }

  return { granted: granted ?? held, held: held ?? granted, vested };
}

/** Everything a split allocates, which the form holds to exactly 100%. */
export function splitTotal(grants: SetGrantEntry[]): number {
  return grants.reduce((sum, g) => sum + g.equityPct, 0);
}

export const LIVE_STATUS = {
  LIVE: "Live",
  SCHEDULED: "Launching",
  UNSCHEDULED: "Not scheduled",
} as const;

export type LiveStatus = keyof typeof LIVE_STATUS;

/**
 * Whether the product is live, derived from its launch date so the two can't
 * contradict each other. A date in the future is a plan, not a launch, so it
 * reads as scheduled until the day arrives and then flips on its own.
 */
export function liveStatus(
  liveDate: string | Date | null | undefined,
  asOf: Date = new Date(),
): LiveStatus {
  if (!liveDate) return "UNSCHEDULED";
  const date = new Date(liveDate);
  if (Number.isNaN(date.getTime())) return "UNSCHEDULED";
  return date.getTime() <= asOf.getTime() ? "LIVE" : "SCHEDULED";
}

/** "Live since 1 Aug 2026" / "Launching 1 Dec 2026" / "Not scheduled". */
export function formatLiveStatus(
  liveDate: string | Date | null | undefined,
  asOf: Date = new Date(),
): string {
  const status = liveStatus(liveDate, asOf);
  if (status === "UNSCHEDULED") return LIVE_STATUS.UNSCHEDULED;
  const when = new Date(liveDate as string | Date).toLocaleDateString();
  return status === "LIVE" ? `Live since ${when}` : `Launching ${when}`;
}

export type SetGrantEntry = {
  equityPct: number;
  contractId?: string | null;
  holder?: { isUs: boolean } | null;
};

/** One dated version of a split: everyone's rows, and the price at the time. */
export type SetEntry = {
  effectiveOn: string;
  valuation?: number | null;
  grants: SetGrantEntry[];
};

/**
 * Our rows in a split. Names came later than the splits themselves, so a set
 * where nobody is named is read as entirely ours — that's what a row meant
 * before the whole cap table was recorded here. Once any row carries a name,
 * only the ones naming us count.
 */
export function ourGrants<T extends SetGrantEntry>(grants: T[]): T[] {
  const ours = grants.filter((g) => g.holder?.isUs);
  if (ours.length > 0) return ours;
  return grants.some((g) => g.holder) ? [] : grants;
}

/** Our share of a split, summed: a protected stake spans a row per milestone. */
export function ourPctIn(set: SetEntry | null | undefined): number | null {
  if (!set) return null;
  const ours = ourGrants(set.grants);
  if (ours.length === 0) return null;
  return ours.reduce((sum, g) => sum + g.equityPct, 0);
}

/**
 * The share of the company nobody in this split accounts for. Splits are
 * entered from what the founders tell us and that is often partial, so the gap
 * is reported as unknown rather than assigned to whoever is listed.
 */
export function unallocatedPct(set: SetEntry): number {
  const held = set.grants.reduce((sum, g) => sum + g.equityPct, 0);
  // Rounding noise from percentages typed to two decimals shouldn't surface as
  // a sliver of unallocated equity, nor should an over-100 split read as a gap.
  const gap = 100 - held;
  return Math.abs(gap) < 0.005 ? 0 : gap;
}

/** Splits already in effect on `asOf`, newest first. */
export function effectiveSets<T extends SetEntry>(sets: T[], asOf: Date = new Date()): T[] {
  return sets
    .filter((s) => new Date(s.effectiveOn).getTime() <= asOf.getTime())
    .sort((a, b) => new Date(b.effectiveOn).getTime() - new Date(a.effectiveOn).getTime());
}

/**
 * The split as it last stood. Future-dated sets are ignored: one being
 * negotiated must not be read as one that took effect.
 */
export function currentSet<T extends SetEntry>(sets: T[], asOf: Date = new Date()): T | null {
  return effectiveSets(sets, asOf)[0] ?? null;
}

/** The split we started from, which is what "granted" means. */
export function originalSet<T extends SetEntry>(sets: T[]): T | null {
  return (
    [...sets].sort(
      (a, b) => new Date(a.effectiveOn).getTime() - new Date(b.effectiveOn).getTime(),
    )[0] ?? null
  );
}

/**
 * What we hold today: our share of the newest split in effect. Every later
 * split restates the whole cap table, so the dilution is already in the figure
 * rather than something to apply on top of it.
 */
export function ownershipAsOf(sets: SetEntry[], asOf: Date = new Date()): number | null {
  return ourPctIn(currentSet(sets, asOf));
}

/** What the company is worth: the price stated on the split now in effect. */
export function currentValuationOf(
  portfolio: { sets: SetEntry[] },
  asOf: Date = new Date(),
): number | null {
  return currentSet(portfolio.sets, asOf)?.valuation ?? null;
}

export type SummaryPortfolio = {
  valuationCurrency: string;
  liveDate: string | null;
  contracts: {
    id: string;
    signed: boolean;
    startDate: string | null;
    endDate: string | null;
    lengthUnit?: string | null;
  }[];
  sets: SetEntry[];
};

export type EquitySummary = {
  companies: number;
  signedCompanies: number;
  inDevelopment: number;
  liveCompanies: number;
  valuedCompanies: number;
  /** What the first split gave us, before any later one diluted it. */
  grantedPct: number | null;
  /** What we hold today, per the latest split. */
  currentPct: number | null;
  vestedPct: number | null;
  portfolioValuation: number | null;
  currentEquityValue: number | null;
  /** The shared currency of the money totals, or null when they can't be added. */
  currency: string | null;
};

/**
 * Portfolio-wide headline figures, derived on every render like everything else
 * in this module.
 *
 * The money totals are only produced when every valued portfolio is priced in
 * the same currency. Adding a KWD valuation to a USD one yields a number that
 * looks authoritative and means nothing, so those totals come back null instead
 * and the report says so rather than printing a fiction.
 */
export function summarisePortfolios(
  portfolios: SummaryPortfolio[],
  asOf: Date = new Date(),
): EquitySummary {
  let grantedTotal = 0;
  let currentTotal = 0;
  let vestedTotal = 0;
  let hasGrants = false;
  let signedCompanies = 0;
  let inDevelopment = 0;
  let liveCompanies = 0;
  let valuedCompanies = 0;
  let valuationTotal = 0;
  let equityValueTotal = 0;
  const currencies = new Set<string>();

  for (const p of portfolios) {
    const { granted, held, vested } = computePortfolioEquity(p, asOf);
    const current = held;
    if (granted != null) {
      hasGrants = true;
      grantedTotal += granted;
      currentTotal += current ?? granted;
      vestedTotal += vested ?? 0;
    }

    if (p.contracts.some((c) => c.signed)) signedCompanies += 1;

    // Live and in-development are the two halves of the launch date and nothing
    // else, so every company falls in exactly one of them and the pair always
    // adds up to the portfolio. A company with no date set hasn't shipped, so
    // it's still being built.
    if (liveStatus(p.liveDate, asOf) === "LIVE") {
      liveCompanies += 1;
    } else {
      inDevelopment += 1;
    }

    const valuation = currentValuationOf(p, asOf);
    if (valuation != null) {
      valuedCompanies += 1;
      valuationTotal += valuation;
      // Worth what we hold now, not what we were granted before dilution.
      equityValueTotal += equityValueAt(current, valuation) ?? 0;
      currencies.add(p.valuationCurrency);
    }
  }

  const comparable = currencies.size === 1;
  return {
    companies: portfolios.length,
    signedCompanies,
    inDevelopment,
    liveCompanies,
    valuedCompanies,
    grantedPct: hasGrants ? grantedTotal : null,
    currentPct: hasGrants ? currentTotal : null,
    vestedPct: hasGrants ? vestedTotal : null,
    portfolioValuation: comparable ? valuationTotal : null,
    currentEquityValue: comparable ? equityValueTotal : null,
    currency: comparable ? [...currencies][0] : null,
  };
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
