// Pure helpers for monthly financial figures — usable from both server and
// client, like equity-math.ts beside it.
//
// Two ideas carry the whole module. A figure belongs to a month, and a *pack*
// states figures for however many months it covers; so the same month can be
// stated twice by two packs, and the later pack is the one that counts. And a
// calculated field is worked out at read time from the fields under it, which
// may themselves be calculated, so resolving one is a walk rather than a lookup.

import { evaluateFormula, isDateMetric, isFormulaMetric } from "@/lib/equity-math";

// ── Months ──────────────────────────────────────────────────────────────────

/**
 * A month as "2026-03".
 *
 * Figures are keyed by this rather than by a Date. Two packs stating January
 * have to agree that it is the same January, and comparing dates for that means
 * trusting that both were pinned to the same instant — which is exactly the
 * thing a stray time-of-day breaks. A string either matches or it doesn't.
 */
export type MonthKey = string;

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function monthKeyOf(date: string | Date): MonthKey | null {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC midnight on the first, which is how a month is stored. */
export function monthStartOf(key: MonthKey): string | null {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month, 1)).toISOString();
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

/** Every month of a year, oldest first — the columns of the entry grid. */
export function monthKeysOfYear(year: number): MonthKey[] {
  return MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** "Mar 2026", or "Mar" when the year is already established by the column. */
export function formatMonth(key: MonthKey, withYear = true): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return "—";
  const name = MONTH_NAMES[parsed.month];
  return withYear ? `${name} ${parsed.year}` : name;
}

/** "July 2026" — how a pack is referred to, by when it was reported. */
export function formatPackLabel(reportedOn: string | Date | null | undefined): string {
  if (!reportedOn) return "—";
  const d = new Date(reportedOn);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Resolving what a month actually says ────────────────────────────────────

export interface PackValue {
  metricId: string;
  month: string | Date;
  numberValue: number | null;
  dateValue: string | Date | null;
}

export interface Pack {
  id: string;
  reportedOn: string | Date;
  audited?: boolean;
  values: PackValue[];
  /** Null while the pack is still being entered. See {@link publishedPacks}. */
  publishedAt?: string | Date | null;
}

/**
 * Only the packs that have been published.
 *
 * Every reading of the figures goes through this — a chart, a total, a
 * comparison across projects, the restatement resolver. A pack still being
 * entered has to state nothing at all, and "nothing at all" has to mean it
 * cannot restate a month either: an unpublished July sitting in front of a
 * published April must not blank out April's figures on its way to being
 * finished.
 *
 * A pack with no publishedAt field at all counts as published, so a pack
 * assembled by hand — in a test, say — doesn't have to say so.
 */
export function publishedPacks<T extends { publishedAt?: string | Date | null }>(
  packs: T[],
): T[] {
  return packs.filter((p) => p.publishedAt !== null);
}

/** One field's figure for one month, and which pack said so. */
export interface Figure {
  metricId: string;
  month: MonthKey;
  numberValue: number | null;
  dateValue: string | null;
  packId: string;
  reportedOn: string;
}

export interface MonthlySeries {
  /** The figure that counts, keyed by `figureKey`. */
  effective: Map<string, Figure>;
  /**
   * What a later pack replaced, oldest first. Empty for almost every figure —
   * it only fills in when a month gets restated, which is the case worth
   * showing rather than the normal one.
   */
  superseded: Map<string, Figure[]>;
  /** Every month any pack has something to say about, oldest first. */
  months: MonthKey[];
}

export function figureKey(metricId: string, month: MonthKey): string {
  return `${metricId}|${month}`;
}

/**
 * Fold a project's packs into the figures that count.
 *
 * The rule is only that a later pack wins, and "later" means reportedOn: the
 * pack received in July restates the January it covers, whatever order the
 * packs happened to be typed into the system in. Sorting by reportedOn rather
 * than by createdAt is the whole point — figures get entered late, and a
 * backfilled pack from April must not override the July one that corrected it.
 *
 * Nothing is discarded. The replaced figures are kept so the grid can mark a
 * restated cell and say what it used to be, which is the only way to answer
 * what changed between two packs.
 */
export function resolveMonthlySeries(packs: Pack[]): MonthlySeries {
  const effective = new Map<string, Figure>();
  const superseded = new Map<string, Figure[]>();
  const months = new Set<MonthKey>();

  // Oldest first, so each pack simply overwrites what came before it and the
  // one left standing at the end is the latest. Ties can't happen for a real
  // portfolio — reportedOn is unique per portfolio — but id keeps the order
  // deterministic for anything assembled by hand, a test especially.
  const ordered = [...packs].sort((a, b) => {
    const diff = new Date(a.reportedOn).getTime() - new Date(b.reportedOn).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  for (const pack of ordered) {
    const reportedOn = new Date(pack.reportedOn).toISOString();
    for (const value of pack.values) {
      const month = monthKeyOf(value.month);
      if (!month) continue;
      months.add(month);

      const key = figureKey(value.metricId, month);
      const figure: Figure = {
        metricId: value.metricId,
        month,
        numberValue: value.numberValue,
        dateValue: value.dateValue ? new Date(value.dateValue).toISOString() : null,
        packId: pack.id,
        reportedOn,
      };

      const previous = effective.get(key);
      if (previous) {
        const history = superseded.get(key) ?? [];
        history.push(previous);
        superseded.set(key, history);
      }
      effective.set(key, figure);
    }
  }

  return {
    effective,
    superseded,
    months: [...months].sort(),
  };
}

/** The figure that counts for one field in one month, or null if never stated. */
export function figureAt(
  series: MonthlySeries,
  metricId: string,
  month: MonthKey,
): Figure | null {
  return series.effective.get(figureKey(metricId, month)) ?? null;
}

/** What earlier packs said about a figure a later one restated, oldest first. */
export function supersededAt(
  series: MonthlySeries,
  metricId: string,
  month: MonthKey,
): Figure[] {
  return series.superseded.get(figureKey(metricId, month)) ?? [];
}

// ── Calculated fields ───────────────────────────────────────────────────────

export interface MetricDef {
  id: string;
  type: string;
  formulaOp?: string | null;
  leftId?: string | null;
  rightId?: string | null;
}

/**
 * Every field a calculated field stands on, however deep.
 *
 * Walks through calculated operands to the plain figures underneath, and
 * reports both: the intermediate calculations are what makes a cycle, and the
 * plain figures are what actually has to be reported for the top of the chain
 * to come out. The field itself is not in the result unless it genuinely
 * reaches itself.
 *
 * Tolerates a cycle rather than refusing one, because this is the thing used to
 * detect cycles and it can't need a cycle-free registry to run.
 */
export function formulaDependencies(
  metricId: string,
  registry: Map<string, MetricDef>,
): { all: Set<string>; leaves: Set<string> } {
  const all = new Set<string>();
  const leaves = new Set<string>();

  const walk = (id: string) => {
    const metric = registry.get(id);
    if (!metric) return;
    if (!isFormulaMetric(metric.type)) {
      leaves.add(id);
      return;
    }
    for (const operand of [metric.leftId, metric.rightId]) {
      if (!operand) continue;
      if (all.has(operand)) continue;
      all.add(operand);
      walk(operand);
    }
  };

  walk(metricId);
  return { all, leaves };
}

/**
 * Whether making `candidate` an operand of `metricId` would close a loop —
 * either because it is the field itself, or because it already depends on it.
 */
export function wouldCycle(
  metricId: string,
  candidate: string,
  registry: Map<string, MetricDef>,
): boolean {
  if (metricId === candidate) return true;
  return formulaDependencies(candidate, registry).all.has(metricId);
}

/**
 * A calculated field's value, following its operands as far as they go.
 *
 * The operands of a formula can be formulas themselves, which is what a P&L
 * needs: gross profit is revenue less cost of sales, and net profit is built on
 * gross profit rather than on revenue again. Reading a formula's operands out of
 * the stored figures alone — as the old report view did — leaves any formula
 * standing on another formula permanently blank, because a calculated field is
 * never stored.
 *
 * Returns null rather than throwing on a cycle. A field defined in terms of
 * itself is a mistake in the registry, and the honest reading of it is that
 * nobody can say what it equals, which is what null means everywhere else here.
 */
export function resolveNumber(
  metricId: string,
  registry: Map<string, MetricDef>,
  stored: (metricId: string) => number | null,
  memo: Map<string, number | null> = new Map(),
): number | null {
  return resolveNumberInner(metricId, registry, stored, memo, new Set());
}

function resolveNumberInner(
  metricId: string,
  registry: Map<string, MetricDef>,
  stored: (metricId: string) => number | null,
  memo: Map<string, number | null>,
  seen: Set<string>,
): number | null {
  if (memo.has(metricId)) return memo.get(metricId) ?? null;

  const metric = registry.get(metricId);
  if (!metric) return null;

  if (!isFormulaMetric(metric.type)) {
    const value = stored(metricId);
    memo.set(metricId, value);
    return value;
  }

  // Guard before recursing, not after: a formula that reaches itself would
  // otherwise recurse until the stack gave out.
  if (seen.has(metricId)) return null;
  seen.add(metricId);

  const left = metric.leftId
    ? resolveNumberInner(metric.leftId, registry, stored, memo, seen)
    : null;
  const right = metric.rightId
    ? resolveNumberInner(metric.rightId, registry, stored, memo, seen)
    : null;

  seen.delete(metricId);

  const worked = evaluateFormula(metric.formulaOp, left, right);
  memo.set(metricId, worked);
  return worked;
}

/**
 * Every field's number for one month, calculated fields included.
 *
 * One memo per month, deliberately: the same formula asked for twice in a month
 * is the same answer, and asked for in a different month is a different one.
 */
export function monthColumn(
  series: MonthlySeries,
  registry: Map<string, MetricDef>,
  metricIds: string[],
  month: MonthKey,
): Map<string, number | null> {
  const memo = new Map<string, number | null>();
  const stored = (metricId: string) => figureAt(series, metricId, month)?.numberValue ?? null;

  const column = new Map<string, number | null>();
  for (const metricId of metricIds) {
    column.set(metricId, resolveNumber(metricId, registry, stored, memo));
  }
  return column;
}

// ── Reading a series ────────────────────────────────────────────────────────

/**
 * Sum of the months reported so far, or null if none were.
 *
 * A blank month is not a zero. Nobody filed it, and totalling it as nothing
 * would turn a gap in reporting into a claim that the company took nothing that
 * month — which is the one thing a financial table must not say by accident.
 */
export function ytdTotal(values: (number | null | undefined)[]): number | null {
  let total = 0;
  let reported = false;
  for (const value of values) {
    if (value == null) continue;
    total += value;
    reported = true;
  }
  return reported ? total : null;
}

/**
 * Change from one month to the next, as a fraction — 0.25 for a quarter up.
 *
 * Null when either month is missing, and null when the earlier one is zero:
 * growth from nothing has no percentage, only a direction.
 */
export function changeVsPrevious(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** A margin as a fraction of revenue — gross, net, whichever is passed in. */
export function marginOf(
  profit: number | null | undefined,
  revenue: number | null | undefined,
): number | null {
  if (profit == null || revenue == null || revenue === 0) return null;
  return profit / revenue;
}

// ── Currency ────────────────────────────────────────────────────────────────

export interface RateRow {
  code: string;
  rate: number;
  isBase: boolean;
}

export function baseCurrencyOf(rates: RateRow[]): string | null {
  return rates.find((r) => r.isBase)?.code ?? null;
}

/**
 * One project's figure in the base currency.
 *
 * Null when the currency has no rate, rather than passing the number through
 * unconverted. A total that silently added KWD to USD would be wrong in a way
 * nobody could see; a total that says which project it had to leave out can at
 * least be fixed.
 */
export function convertToBase(
  value: number | null | undefined,
  code: string | null | undefined,
  rates: RateRow[],
): number | null {
  if (value == null || !code) return null;
  const row = rates.find((r) => r.code === code);
  if (!row || !Number.isFinite(row.rate)) return null;
  return value * row.rate;
}

// ── Across projects ─────────────────────────────────────────────────────────

export interface PortfolioFinancials {
  id: string;
  name: string;
  /** What this project's figures are quoted in — not necessarily the base. */
  currency: string;
  packs: Pack[];
}

export interface PortfolioFinancialsRow {
  id: string;
  name: string;
  currency: string;
  /** Per month, in the project's own currency. */
  top: (number | null)[];
  bottom: (number | null)[];
  topTotal: number | null;
  bottomTotal: number | null;
  /** Bottom line as a share of the top, from the totals rather than averaged. */
  margin: number | null;
  /** The totals in the base currency, or null when there's no rate to use. */
  topTotalBase: number | null;
  bottomTotalBase: number | null;
}

export interface FinancialsSummary {
  months: MonthKey[];
  rows: PortfolioFinancialsRow[];
  /** Every convertible project added together, per month, in the base currency. */
  topBase: (number | null)[];
  bottomBase: (number | null)[];
  topBaseTotal: number | null;
  bottomBaseTotal: number | null;
  marginBase: number | null;
  baseCurrency: string | null;
  /**
   * Projects the totals had to leave out, because their currency has no rate.
   * Named rather than silently dropped — a total short by a company is worse
   * than a total that says which company it is short by.
   */
  excluded: { id: string; name: string; currency: string }[];
}

/**
 * Two chosen figures across every project, month by month, added up in one
 * currency. The financial twin of summarisePortfolios in equity-math.ts, which
 * does the same job for equity percentages and valuations.
 *
 * Which two figures is asked for rather than guessed: the metric registry is
 * global, so the same "Revenue" row is shared by every project, but nothing in
 * it says which field is a top line. Passing the ids in keeps that decision
 * where it can be seen and changed.
 *
 * Lives here rather than beside summarisePortfolios because it needs the
 * resolver above, and equity-math.ts importing this file would close a cycle
 * between the two.
 */
export function summariseFinancials(
  portfolios: PortfolioFinancials[],
  {
    topId,
    bottomId,
    months,
    registry,
    rates,
  }: {
    topId: string | null;
    bottomId: string | null;
    months: MonthKey[];
    registry: Map<string, MetricDef>;
    rates: RateRow[];
  },
): FinancialsSummary {
  const baseCurrency = baseCurrencyOf(rates);
  const excluded: { id: string; name: string; currency: string }[] = [];

  const topBase: (number | null)[] = months.map(() => null);
  const bottomBase: (number | null)[] = months.map(() => null);

  const rows = portfolios.map((portfolio) => {
    const series = resolveMonthlySeries(portfolio.packs);
    const ids = [topId, bottomId].filter((id): id is string => !!id);

    const top: (number | null)[] = [];
    const bottom: (number | null)[] = [];

    months.forEach((month, i) => {
      const column = monthColumn(series, registry, ids, month);
      const t = topId ? (column.get(topId) ?? null) : null;
      const b = bottomId ? (column.get(bottomId) ?? null) : null;
      top.push(t);
      bottom.push(b);

      // Converted month by month rather than only on the totals, so a monthly
      // portfolio line is the sum of the same figures its total is.
      const tBase = convertToBase(t, portfolio.currency, rates);
      const bBase = convertToBase(b, portfolio.currency, rates);
      if (tBase != null) topBase[i] = (topBase[i] ?? 0) + tBase;
      if (bBase != null) bottomBase[i] = (bottomBase[i] ?? 0) + bBase;
    });

    const topTotal = ytdTotal(top);
    const bottomTotal = ytdTotal(bottom);
    const topTotalBase = convertToBase(topTotal, portfolio.currency, rates);

    // Reported something, but in a currency nothing can convert. Worth naming;
    // a project that reported nothing at all is simply absent from the totals
    // and has nothing to explain.
    if ((topTotal != null || bottomTotal != null) && topTotal != null && topTotalBase == null) {
      excluded.push({ id: portfolio.id, name: portfolio.name, currency: portfolio.currency });
    }

    return {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      top,
      bottom,
      topTotal,
      bottomTotal,
      margin: marginOf(bottomTotal, topTotal),
      topTotalBase,
      bottomTotalBase: convertToBase(bottomTotal, portfolio.currency, rates),
    };
  });

  const topBaseTotal = ytdTotal(topBase);
  const bottomBaseTotal = ytdTotal(bottomBase);

  return {
    months,
    rows,
    topBase,
    bottomBase,
    topBaseTotal,
    bottomBaseTotal,
    marginBase: marginOf(bottomBaseTotal, topBaseTotal),
    baseCurrency,
    excluded,
  };
}

/** Every month any project has figures for, oldest first. */
export function financialMonths(portfolios: PortfolioFinancials[]): MonthKey[] {
  const months = new Set<MonthKey>();
  for (const portfolio of portfolios) {
    for (const pack of portfolio.packs) {
      for (const value of pack.values) {
        const month = monthKeyOf(value.month);
        if (month) months.add(month);
      }
    }
  }
  return [...months].sort();
}

// ── Entry ───────────────────────────────────────────────────────────────────

/**
 * What one pack states, as the grid holds it while being edited: a figure per
 * field per month, both blank-able, keyed the same way the resolver keys them.
 */
export type GridDraft = Map<string, { numberValue: number | null; dateValue: string | null }>;

/**
 * The typed cells of a pack, read as figures.
 *
 * The grid stores what was typed, so this is where text becomes a number and a
 * cell that never became one is dropped. Run on the server when a pack is
 * published rather than trusting figures sent from the browser, and shared with
 * the grid so the preview and the stored pack cannot disagree.
 *
 * A blank, an unparseable cell, a field that has since been deleted and a
 * calculated field are all skipped — the last because a calculation is worked
 * out from the figures every time it is read and has nothing of its own to
 * store.
 */
export function packCellsToValues(
  cells: Record<string, string>,
  registry: Map<string, MetricDef>,
): { metricId: string; month: string; numberValue: number | null; dateValue: string | null }[] {
  const rows: {
    metricId: string;
    month: string;
    numberValue: number | null;
    dateValue: string | null;
  }[] = [];

  for (const [key, raw] of Object.entries(cells)) {
    const text = raw.trim();
    if (!text) continue;

    const [metricId, month] = key.split("|");
    if (!metricId || !month) continue;

    const metric = registry.get(metricId);
    if (!metric || isFormulaMetric(metric.type)) continue;

    const monthStart = monthStartOf(month);
    if (!monthStart) continue;

    if (isDateMetric(metric.type)) {
      rows.push({ metricId, month: monthStart, numberValue: null, dateValue: text });
      continue;
    }

    const number = parsePastedNumber(text);
    if (number == null) continue;
    rows.push({ metricId, month: monthStart, numberValue: number, dateValue: null });
  }

  return rows;
}

/**
 * Turn a grid back into rows for saving, dropping the cells nobody filled.
 *
 * A blank cell is not a figure and must not become one — see ytdTotal. Dropping
 * it here rather than storing a null row also means a month can be added to a
 * pack later without the pack having claimed anything about it in the meantime.
 */
export function draftToValues(
  draft: GridDraft,
  registry: Map<string, MetricDef>,
): { metricId: string; month: string; numberValue: number | null; dateValue: string | null }[] {
  const rows: {
    metricId: string;
    month: string;
    numberValue: number | null;
    dateValue: string | null;
  }[] = [];

  for (const [key, cell] of draft) {
    const [metricId, month] = key.split("|");
    if (!metricId || !month) continue;

    const metric = registry.get(metricId);
    // A calculated field is read, never entered, so it has nothing to save.
    if (!metric || isFormulaMetric(metric.type)) continue;

    const monthStart = monthStartOf(month);
    if (!monthStart) continue;

    if (isDateMetric(metric.type)) {
      if (!cell.dateValue) continue;
      rows.push({ metricId, month: monthStart, numberValue: null, dateValue: cell.dateValue });
      continue;
    }

    if (cell.numberValue == null) continue;
    rows.push({ metricId, month: monthStart, numberValue: cell.numberValue, dateValue: null });
  }

  return rows;
}

/**
 * A figure read the way it is written in a management report.
 *
 * Accounting notation is accepted rather than rejected, because that is what
 * gets typed when somebody is copying a statement line by line: thousands
 * separators, a currency symbol, and "(3,275)" for a negative, which is how
 * every management report writes a loss.
 *
 * Anything left unparseable comes back null rather than zero. A cell reading
 * "n/a", or one still half-typed, is not a figure, and guessing it as nothing
 * would file a claim the report never made.
 */
export function parsePastedNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text || text === "—" || text === "-") return null;

  const negative = /^\(.*\)$/.test(text);
  const digits = text.replace(/[()]/g, "").replace(/[^0-9.\-]/g, "");
  if (!digits || digits === "-" || digits === ".") return null;

  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}
