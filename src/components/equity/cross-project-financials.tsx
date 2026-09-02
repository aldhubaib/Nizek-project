"use client";

// The portfolio's financials read across every project at once: two chosen
// lines per company per month, a combined total in one currency, and the
// companies ranked by margin.
//
// Adding figures from different currencies together is the one thing this view
// must not do quietly, so a project whose currency has no rate is named and left
// out of the total rather than folded in unconverted.

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChartFrame } from "@/components/equity/chart-frame";
import { SeriesArea, SERIES } from "@/components/equity/pitch-charts";
import { formatMetricValue, isDateMetric, isFormulaMetric } from "@/lib/equity-math";
import {
  financialMonths,
  publishedPacks,
  formatMonth,
  summariseFinancials,
  type MetricDef,
  type MonthKey,
  type RateRow,
} from "@/lib/equity-financials";
import type { EquityMetricDTO, EquityPortfolioDTO } from "@/actions/equity";

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatShare(fraction: number | null): string {
  if (fraction == null) return "—";
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

const selectCls =
  "h-8 rounded-lg border border-border bg-card px-2 text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

/** The registry field whose name reads like a top or bottom line. */
function guessField(metrics: EquityMetricDTO[], pattern: RegExp): string | null {
  return metrics.find((m) => pattern.test(m.name))?.id ?? null;
}

export function CrossProjectFinancials({
  portfolios,
  metrics,
  rates,
}: {
  portfolios: EquityPortfolioDTO[];
  metrics: EquityMetricDTO[];
  rates: RateRow[];
}) {
  const financialMetrics = useMemo(
    () => metrics.filter((m) => m.group === "FINANCIAL" && !isDateMetric(m.type)),
    [metrics],
  );

  const inputs = useMemo(
    () =>
      portfolios.map((p) => ({
        id: p.id,
        name: p.project.name,
        currency: p.valuationCurrency,
        // Published only, so a project mid-way through entering a year doesn't
        // drag a total down with columns nobody has finished.
        packs: publishedPacks(p.financialReports).map((r) => ({
          id: r.id,
          reportedOn: r.reportedOn,
          values: r.values,
        })),
      })),
    [portfolios],
  );

  const allMonths = useMemo(() => financialMonths(inputs), [inputs]);

  const years = useMemo(() => {
    const found = new Set<number>();
    for (const month of allMonths) found.add(parseInt(month.slice(0, 4), 10));
    return [...found].sort((a, b) => b - a);
  }, [allMonths]);

  const [year, setYear] = useState<number | null>(null);
  const shownYear = year != null && years.includes(year) ? year : (years[0] ?? null);

  const [topId, setTopId] = useState<string | null>(null);
  const [bottomId, setBottomId] = useState<string | null>(null);
  const top = topId ?? guessField(financialMetrics, /revenue|sales|turnover/i);
  const bottom = bottomId ?? guessField(financialMetrics, /net profit|net income|bottom line/i);

  const topMetric = financialMetrics.find((m) => m.id === top) ?? null;
  const bottomMetric = financialMetrics.find((m) => m.id === bottom) ?? null;

  const registry = useMemo(
    () => new Map<string, MetricDef>(metrics.map((m) => [m.id, m])),
    [metrics],
  );

  const months = useMemo(
    () => allMonths.filter((m) => m.startsWith(String(shownYear))),
    [allMonths, shownYear],
  );

  const summary = useMemo(
    () =>
      summariseFinancials(inputs, {
        topId: top,
        bottomId: bottom,
        months,
        registry,
        rates,
      }),
    [inputs, top, bottom, months, registry, rates],
  );

  // Only companies that actually reported the top line: a company with nothing
  // filed has no place in a ranking, and ranking it last would read as a claim
  // that its margin was the worst.
  const reporting = summary.rows.filter((r) => r.topTotal != null);
  const ranked = [...reporting]
    .filter((r) => r.margin != null)
    .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0));

  const money = (value: number | null, currency: string | null) =>
    value == null
      ? "—"
      : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}${
          currency ? ` ${currency}` : ""
        }`;

  if (allMonths.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-s text-muted-foreground">
          No financial figures reported on any project yet. Enter a report on a portfolio and it
          will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Top line
          <select
            value={top ?? ""}
            onChange={(e) => setTopId(e.target.value)}
            className={selectCls}
          >
            <option value="">Pick a field…</option>
            {financialMetrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Bottom line
          <select
            value={bottom ?? ""}
            onChange={(e) => setBottomId(e.target.value)}
            className={selectCls}
          >
            <option value="">Pick a field…</option>
            {financialMetrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {isFormulaMetric(m.type) ? " (calculated)" : ""}
              </option>
            ))}
          </select>
        </label>
        {years.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Year
            <select
              value={shownYear ?? ""}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="flex-1 min-w-[240px] pb-1.5 text-xs text-muted-foreground">
          The two figures every company is compared on. The fields are shared across projects, so
          the same choice reads the same everywhere.{" "}
          {summary.baseCurrency
            ? `Totals are in ${summary.baseCurrency}.`
            : "No base currency is set, so nothing can be totalled — set one under Exchange rates in admin."}
        </p>
      </div>

      {!topMetric ? (
        <p className="text-s text-muted-foreground">
          Pick a top line to compare the companies on.
        </p>
      ) : (
        <>
          {/* ── Per company ── */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-s">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 min-w-[160px] border-e border-border bg-muted/40 px-3 py-2 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {shownYear}
                  </th>
                  {months.map((month) => (
                    <th
                      key={month}
                      className="min-w-[86px] px-2 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {formatMonth(month, false)}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-s border-border px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                  <th className="min-w-[110px] px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    In {summary.baseCurrency ?? "base"}
                  </th>
                  <th className="min-w-[80px] px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {reporting.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <th className="sticky left-0 z-10 border-e border-border bg-card px-3 py-1.5 text-start font-normal">
                      <Link
                        href={`/dashboard/equity/${row.id}`}
                        className="text-foreground no-underline hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="ms-1.5 text-xs text-muted-foreground">{row.currency}</span>
                    </th>
                    {row.top.map((value, i) => (
                      <td
                        key={months[i]}
                        className="px-2 py-1.5 text-end tabular-nums text-foreground"
                      >
                        {value == null
                          ? "—"
                          : formatMetricValue(topMetric, { numberValue: value })}
                      </td>
                    ))}
                    <td className="border-s border-border px-3 py-1.5 text-end tabular-nums text-foreground">
                      {money(row.topTotal, row.currency)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-end tabular-nums",
                        row.topTotalBase == null ? "text-orange" : "text-muted-foreground",
                      )}
                      title={
                        row.topTotalBase == null
                          ? `No exchange rate for ${row.currency}, so this is left out of the total`
                          : undefined
                      }
                    >
                      {row.topTotalBase == null
                        ? "no rate"
                        : money(row.topTotalBase, summary.baseCurrency)}
                    </td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-muted-foreground">
                      {formatShare(row.margin)}
                    </td>
                  </tr>
                ))}

                {/* The portfolio, added up. Set apart because it is the one row
                    here that isn't a company. */}
                <tr className="border-t-2 border-border bg-primary/[0.05] font-medium">
                  <th className="sticky left-0 z-10 border-e border-border bg-primary/[0.05] px-3 py-2 text-start">
                    Portfolio
                  </th>
                  {summary.topBase.map((value, i) => (
                    <td
                      key={months[i]}
                      className="px-2 py-2 text-end tabular-nums text-foreground"
                    >
                      {value == null ? "—" : compactNumber(value)}
                    </td>
                  ))}
                  <td className="border-s border-border px-3 py-2 text-end tabular-nums text-muted-foreground">
                    —
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-foreground">
                    {money(summary.topBaseTotal, summary.baseCurrency)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-foreground">
                    {formatShare(summary.marginBase)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            The months show {topMetric.name.toLowerCase()} in each company&apos;s own currency;
            the portfolio row is the converted total. Margin is{" "}
            {bottomMetric ? bottomMetric.name.toLowerCase() : "the bottom line"} as a share of{" "}
            {topMetric.name.toLowerCase()}, worked out from the totals.
          </p>

          {summary.excluded.length > 0 && (
            <div className="space-y-0.5 rounded-lg border border-orange/30 bg-orange/5 px-3 py-2.5">
              <p className="text-xs font-medium text-orange">
                {summary.excluded.length} compan
                {summary.excluded.length === 1 ? "y is" : "ies are"} left out of the total — no
                exchange rate
              </p>
              {summary.excluded.map((e) => (
                <p key={e.id} className="text-xs text-muted-foreground">
                  • {e.name} reports in {e.currency}. Add a rate for it under Exchange rates in
                  admin.
                </p>
              ))}
            </div>
          )}

          {/* ── Margin ranking ── */}
          {ranked.length > 1 && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                Ranked by margin
              </p>
              <div className="space-y-1.5">
                {ranked.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/equity/${row.id}`}
                      className="w-36 shrink-0 truncate text-s text-foreground no-underline hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "absolute inset-y-0 start-0 rounded-full",
                          (row.margin ?? 0) < 0 ? "bg-destructive/60" : "bg-primary/70",
                        )}
                        // Scaled against the best margin on the list rather than
                        // against 100%, so a portfolio of thin margins is still
                        // legible as a ranking.
                        style={{
                          width: `${Math.min(
                            100,
                            Math.abs(row.margin ?? 0) /
                              Math.max(
                                ...ranked.map((r) => Math.abs(r.margin ?? 0)),
                                Number.EPSILON,
                              ) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-end text-s tabular-nums text-muted-foreground">
                      {formatShare(row.margin)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trend ── */}
          {reporting.length > 0 && months.length > 1 && (
            <ChartFrame
              title={`${topMetric.name} by company, month by month`}
              note={`Each company's ${topMetric.name.toLowerCase()} converted to ${
                summary.baseCurrency ?? "the base currency"
              }, taking the latest report's version of any month two reports disagree about. A company with no exchange rate is left off.`}
              source={`Financials · ${reporting.length} ${
                reporting.length === 1 ? "company" : "companies"
              }, ${months.length} months of ${shownYear}`}
              data={{
                columns: ["Month", ...reporting.map((r) => r.name), "Portfolio"],
                rows: months.map((month, i) => [
                  formatMonth(month),
                  ...reporting.map((r) => money(r.top[i], r.currency)),
                  money(summary.topBase[i], summary.baseCurrency),
                ]),
              }}
            >
              <SeriesArea
                labels={months.map((m) => formatMonth(m))}
                series={reporting.map((row, i) => ({
                  name: row.name,
                  color: SERIES[i % SERIES.length],
                  // Converted, so the bands are stacked in comparable units —
                  // a USD company drawn beside a KWD one at face value would
                  // look three times its size.
                  values: convertedRow(row, months, rates),
                  format: (value: number) => money(value, summary.baseCurrency),
                }))}
                format={compactNumber}
                axisFormat={compactNumber}
              />
            </ChartFrame>
          )}
        </>
      )}
    </div>
  );
}

/** One company's monthly top line in the base currency, for a shared axis. */
function convertedRow(
  row: { top: (number | null)[]; currency: string },
  months: MonthKey[],
  rates: RateRow[],
): (number | null)[] {
  const rate = rates.find((r) => r.code === row.currency)?.rate ?? null;
  return months.map((_, i) => {
    const value = row.top[i];
    return value == null || rate == null ? null : value * rate;
  });
}
