"use client";

// The figures read rather than entered: the effective monthly P&L, what moved,
// and what a later report changed its mind about.
//
// Everything here comes out of the resolver, so it reads the same figures the
// portfolio totals do. A month two reports disagree about resolves once, and the
// disagreement is shown as history rather than averaged away.

import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { ChartFrame } from "@/components/equity/chart-frame";
import { SeriesArea, SERIES } from "@/components/equity/pitch-charts";
import { formatMetricValue, isDateMetric, isFormulaMetric } from "@/lib/equity-math";
import {
  changeVsPrevious,
  figureAt,
  formatMonth,
  formatPackLabel,
  marginOf,
  monthColumn,
  resolveMonthlySeries,
  supersededAt,
  ytdTotal,
  type MetricDef,
  type MonthKey,
} from "@/lib/equity-financials";
import type { EquityMetricDTO, EquityPortfolioDTO } from "@/actions/equity";

type ReportField = { metric: EquityMetricDTO; required: boolean };

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** "+12.4%" / "−8.0%" — a move, with its direction in the sign. */
function formatChange(fraction: number | null): string {
  if (fraction == null) return "—";
  const pct = (fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return fraction > 0 ? `+${pct}%` : fraction < 0 ? `−${pct.replace("-", "")}%` : "0%";
}

function formatShare(fraction: number | null): string {
  if (fraction == null) return "—";
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/**
 * The field margins are measured against, guessed from its name.
 *
 * A margin is a share of revenue, and nothing in the registry says which field
 * that is — the fields are whatever each project reports. The guess is only a
 * default: the picker beside the table names it and lets it be changed, so a
 * project whose top line is called something else isn't stuck with a wrong
 * denominator it can't see.
 */
function guessBaseField(fields: ReportField[]): string | null {
  const numeric = fields.filter(
    (f) => !isDateMetric(f.metric.type) && !isFormulaMetric(f.metric.type),
  );
  const revenue = numeric.find((f) => /revenue|sales|turnover|top line/i.test(f.metric.name));
  return (revenue ?? numeric[0])?.metric.id ?? null;
}

export function FinancialsAnalysis({
  portfolio,
  metrics,
  currency,
}: {
  portfolio: EquityPortfolioDTO;
  metrics: EquityMetricDTO[];
  currency: string;
}) {
  const packs = portfolio.financialReports;

  const series = useMemo(
    () =>
      resolveMonthlySeries(
        packs.map((p) => ({ id: p.id, reportedOn: p.reportedOn, values: p.values })),
      ),
    [packs],
  );

  const fields = useMemo<ReportField[]>(() => {
    const byId = new Map(metrics.map((m) => [m.id, m]));
    return portfolio.reportFields.flatMap((f) => {
      const metric = byId.get(f.metricId);
      return metric ? [{ metric, required: f.required }] : [];
    });
  }, [metrics, portfolio.reportFields]);

  const registry = useMemo(
    () => new Map<string, MetricDef>(metrics.map((m) => [m.id, m])),
    [metrics],
  );

  const years = useMemo(() => {
    const found = new Set<number>();
    for (const month of series.months) found.add(parseInt(month.slice(0, 4), 10));
    return [...found].sort((a, b) => b - a);
  }, [series.months]);

  const [year, setYear] = useState<number | null>(null);
  const shownYear = year != null && years.includes(year) ? year : (years[0] ?? null);

  const [baseId, setBaseId] = useState<string | null>(null);
  const base = baseId ?? guessBaseField(fields);
  const baseMetric = fields.find((f) => f.metric.id === base)?.metric ?? null;

  // Only the months this project actually reported, rather than a blank twelve.
  // A gap in the middle of a year is worth seeing; four empty columns after the
  // last report only say the year isn't over.
  const months = useMemo(
    () => series.months.filter((m) => m.startsWith(String(shownYear))),
    [series.months, shownYear],
  );

  const columns = useMemo(() => {
    const ids = fields.map((f) => f.metric.id);
    return months.map((month) => ({
      month,
      values: monthColumn(series, registry, ids, month),
    }));
  }, [months, fields, series, registry]);

  /** Every figure a later report changed its mind about, newest month first. */
  const restatements = useMemo(() => {
    const found: {
      key: string;
      metric: EquityMetricDTO;
      month: MonthKey;
      was: string;
      now: string;
      by: string;
    }[] = [];

    for (const { metric } of fields) {
      if (isFormulaMetric(metric.type)) continue;
      for (const month of series.months) {
        const history = supersededAt(series, metric.id, month);
        if (history.length === 0) continue;
        const current = figureAt(series, metric.id, month);
        if (!current) continue;
        found.push({
          key: `${metric.id}|${month}`,
          metric,
          month,
          was: formatMetricValue(metric, history[history.length - 1]),
          now: formatMetricValue(metric, current),
          by: formatPackLabel(current.reportedOn),
        });
      }
    }

    return found.sort((a, b) => b.month.localeCompare(a.month));
  }, [fields, series]);

  // Charted across every month on record rather than the shown year: a trend
  // cut at a year boundary is the one place a series most needs to continue.
  const chart = useMemo(() => {
    const plotted = fields
      .map((f) => f.metric)
      .filter((metric) => !isDateMetric(metric.type));

    const allColumns = series.months.map((month) => ({
      month,
      values: monthColumn(
        series,
        registry,
        plotted.map((m) => m.id),
        month,
      ),
    }));

    return plotted
      .map((metric) => ({
        metric,
        values: allColumns.map(({ values }) => values.get(metric.id) ?? null),
      }))
      .filter((s) => s.values.some((v) => v != null))
      .map((s, i) => ({ ...s, color: SERIES[i % SERIES.length] }));
  }, [fields, series, registry]);

  if (packs.length === 0 || fields.length === 0) return null;

  return (
    <CollapsibleCard
      icon={LineChart}
      title="Financials analysis"
      summary={series.months.length > 0 ? series.months.length : undefined}
      description={`The figures as they now stand, month by month, taking the latest report's version of any month two reports disagree about. YTD adds up only the months that were reported — a blank month is a month nobody filed, not a month of nothing.`}
      actions={
        years.length > 1 && (
          <select
            value={shownYear ?? ""}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            aria-label="Year"
            className="h-8 shrink-0 rounded-lg border border-border bg-card px-2 text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )
      }
    >
      {months.length === 0 ? (
        <p className="py-2 text-s text-muted-foreground">
          Nothing reported for {shownYear}.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-s">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 min-w-[180px] border-e border-border bg-muted/40 px-3 py-2 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                  <th className="min-w-[100px] border-s border-border px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    YTD
                  </th>
                  <th
                    className="min-w-[80px] px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    title={`Change from ${
                      months.length > 1 ? formatMonth(months[months.length - 2]) : "the month before"
                    } to ${formatMonth(months[months.length - 1])}`}
                  >
                    MoM
                  </th>
                  {baseMetric && (
                    <th
                      className="min-w-[80px] px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      title={`Share of ${baseMetric.name} in ${formatMonth(
                        months[months.length - 1],
                      )}`}
                    >
                      Margin
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {fields.map(({ metric }) => {
                  const formula = isFormulaMetric(metric.type);
                  const values = columns.map(({ values }) => values.get(metric.id) ?? null);
                  const last = values[values.length - 1];
                  const previous = values.length > 1 ? values[values.length - 2] : null;
                  const dated = isDateMetric(metric.type);

                  const baseLast = baseMetric
                    ? (columns[columns.length - 1]?.values.get(baseMetric.id) ?? null)
                    : null;

                  return (
                    <tr
                      key={metric.id}
                      className={cn(
                        "border-t border-border",
                        formula && "bg-primary/[0.04] font-medium",
                      )}
                    >
                      <th
                        className={cn(
                          "sticky left-0 z-10 truncate border-e border-border bg-card px-3 py-1.5 text-start font-normal text-foreground",
                          formula && "bg-primary/[0.04] font-medium",
                        )}
                      >
                        {metric.name}
                      </th>
                      {months.map((month, i) => (
                        <td
                          key={month}
                          className="px-2 py-1.5 text-end tabular-nums text-foreground"
                        >
                          <RestatementCell
                            metric={metric}
                            month={month}
                            value={values[i]}
                            restated={
                              !formula && supersededAt(series, metric.id, month).length > 0
                            }
                            was={
                              formula
                                ? null
                                : supersededAt(series, metric.id, month).at(-1) ?? null
                            }
                          />
                        </td>
                      ))}
                      <td className="border-s border-border px-3 py-1.5 text-end tabular-nums text-foreground">
                        {dated
                          ? "—"
                          : (() => {
                              const total = ytdTotal(values);
                              return total == null
                                ? "—"
                                : formatMetricValue(metric, { numberValue: total });
                            })()}
                      </td>
                      {/* Uncoloured deliberately. Green for up would be a lie
                          on a cost line, and nothing here knows which fields
                          are meant to grow — the sign carries the direction. */}
                      <td className="px-3 py-1.5 text-end tabular-nums text-foreground">
                        {dated ? "—" : formatChange(changeVsPrevious(last, previous))}
                      </td>
                      {baseMetric && (
                        <td className="px-3 py-1.5 text-end tabular-nums text-muted-foreground">
                          {dated || metric.id === baseMetric.id
                            ? "—"
                            : formatShare(marginOf(last, baseLast))}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-muted-foreground">
              Amounts in {currency} unless the field says otherwise. MoM is the move from{" "}
              {months.length > 1 ? formatMonth(months[months.length - 2]) : "the month before"}{" "}
              to {formatMonth(months[months.length - 1])}.
            </p>
            {fields.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Margins against
                <select
                  value={base ?? ""}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="h-7 rounded-md border border-border bg-card px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {fields
                    .filter((f) => !isDateMetric(f.metric.type))
                    .map((f) => (
                      <option key={f.metric.id} value={f.metric.id}>
                        {f.metric.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          {restatements.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg border border-orange/30 bg-orange/5 px-3 py-2.5">
              <p className="text-xs font-medium text-orange">
                {restatements.length} figure{restatements.length === 1 ? "" : "s"} restated by a
                later report
              </p>
              {restatements.slice(0, 6).map((r) => (
                <p key={r.key} className="text-xs text-muted-foreground">
                  • {r.metric.name}, {formatMonth(r.month)}: {r.was} → {r.now} in the {r.by}{" "}
                  report
                </p>
              ))}
              {restatements.length > 6 && (
                <p className="text-xs text-muted-foreground">
                  • and {restatements.length - 6} more
                </p>
              )}
            </div>
          )}

          {chart.length > 0 && series.months.length > 1 && (
            <ChartFrame
              className="mt-4"
              title="Every reported figure, month by month"
              note="The effective figures across every month on record, taking the latest report's version of a month that more than one report states. A calculated field is worked out from the fields under it rather than read, so it always agrees with them."
              source={`Financials · ${series.months.length} months from ${packs.length} ${
                packs.length === 1 ? "report" : "reports"
              }, oldest first`}
              data={{
                columns: ["Month", ...chart.map((s) => s.metric.name)],
                rows: series.months.map((month, i) => [
                  formatMonth(month),
                  ...chart.map((s) =>
                    s.values[i] == null
                      ? "—"
                      : formatMetricValue(s.metric, { numberValue: s.values[i] }),
                  ),
                ]),
              }}
            >
              <SeriesArea
                labels={series.months.map((m) => formatMonth(m))}
                series={chart.map((s) => ({
                  name: s.metric.name,
                  color: s.color,
                  values: s.values,
                  format: (value: number) =>
                    formatMetricValue(s.metric, { numberValue: value }),
                }))}
                format={compactNumber}
                axisFormat={compactNumber}
              />
            </ChartFrame>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

/**
 * One figure, marked when a later report replaced it.
 *
 * The mark matters more here than anywhere else: this table is what the analysis
 * reads, so a figure that quietly changed between two reports is exactly the
 * thing somebody comparing against a printed pack needs pointed out.
 */
function RestatementCell({
  metric,
  month,
  value,
  restated,
  was,
}: {
  metric: EquityMetricDTO;
  month: MonthKey;
  value: number | null;
  restated: boolean;
  was: { numberValue: number | null; dateValue: string | null } | null;
}) {
  const display = value == null ? "—" : formatMetricValue(metric, { numberValue: value });
  if (!restated) return <>{display}</>;

  return (
    <span
      className="cursor-help border-b border-dotted border-orange/60"
      title={`Restated. Previously ${
        was ? formatMetricValue(metric, was) : "not reported"
      } for ${formatMonth(month)}.`}
    >
      {display}
    </span>
  );
}
