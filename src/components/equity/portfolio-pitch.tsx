"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  AlignLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Coins,
  ExternalLink,
  Flag,
  Globe2,
  Lightbulb,
  Megaphone,
  Package,
  Paperclip,
  PieChart,
  Rocket,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatMarketAmount,
  marketAmount,
  marketTierName,
} from "@/lib/market-size";
import { ChartFrame } from "@/components/equity/chart-frame";
import { PhotoGallery } from "@/components/equity/photo-gallery";
import {
  TractionCount,
  TractionTimeline,
  type TractionProgress,
} from "@/components/equity/traction-views";
import {
  DonutChart,
  MarketRings,
  MetricSpark,
  QuadrantChart,
  RadarChart,
  RosePie,
  SERIES,
  SeriesArea,
  TrendChart,
  seriesColor,
} from "@/components/equity/pitch-charts";
import type { EquityMetricDTO, EquityPortfolioDTO } from "@/actions/equity";
import {
  computePortfolioEquity,
  currentSet,
  equityValueAt,
  evaluateFormula,
  formatLiveStatus,
  formatMetricValue,
  formatPct,
  formatPeriodLabel,
  formatValuation,
  formulaLabel,
  isDateMetric,
  isFormulaMetric,
  liveStatus,
  ourPctIn,
} from "@/lib/equity-math";

/**
 * The portfolio read as a pitch rather than edited as a set of tables.
 *
 * The sections are the modules of the portfolio page — Opportunity, Equity,
 * Financials, Performance and the rest — in the same order and holding the
 * same fields, so anything you can see here you know where to go and change.
 * What differs is the reading: figures are drawn instead of listed, and every
 * chart can show the table it came from, how it was worked out and which module
 * it was read from. A chart nobody can check is just a claim.
 *
 * Fields left empty are skipped rather than shown blank; a half-written deck
 * should look short, not broken.
 */

type Item = NonNullable<EquityPortfolioDTO["opportunity"]>["items"][number];

const ACCENT = "#ff3366";

function itemsOf(portfolio: EquityPortfolioDTO, section: string): Item[] {
  return (portfolio.opportunity?.items ?? []).filter(
    (i) => i.section === section,
  );
}

/**
 * The rail, and with it the deck: the modules of the portfolio page, in the
 * same order and under the same names. Every one of them is shown whether or
 * not it has been filled in — a module missing from a report reads as an
 * oversight, where one that says "No data" reads as the answer it is.
 */
const SECTIONS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "opportunity", label: "Opportunity" },
  { id: "product", label: "The product" },
  { id: "market", label: "Market size" },
  { id: "business-model", label: "Business model" },
  { id: "adoption", label: "Market adoption" },
  { id: "traction", label: "Traction" },
  { id: "competition", label: "Competition" },
  { id: "team", label: "Team" },
  { id: "equity", label: "Equity" },
  { id: "financials", label: "Financials" },
  { id: "performance", label: "Performance" },
];

type Metric = { id: string; name: string; type: string; unit: string | null };

/** Every reading of one metric, oldest first, as a line worth drawing. */
type MetricSeries = {
  metric: Metric;
  points: { label: string; value: number }[];
  /** The most recent reading, already written out for display. */
  latest: string;
  /** Movement since the reading before it, in the metric's own terms. */
  change: number | null;
};

/** "5M", "870K" — a valuation short enough to sit under an axis tick. */
function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

type FinancialReport = EquityPortfolioDTO["financialReports"][number];

/** As much of a financial field as a chart needs to know about it. */
type FinancialField = {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  formulaOp: string | null;
  leftId: string | null;
  rightId: string | null;
};

/**
 * The figures to chart, in the order the project's own form asks for them, plus
 * anything reported against a field it has since stopped asking for — a figure
 * somebody went and got is worth showing whether or not the question survived.
 */
function chartedFields(
  reports: FinancialReport[],
  asked: EquityPortfolioDTO["reportFields"],
): FinancialField[] {
  const onList = new Set(asked.map((f) => f.metricId));
  const dropped = new Map<string, FinancialField>();
  for (const report of reports) {
    for (const value of report.values) {
      if (onList.has(value.metricId) || dropped.has(value.metricId)) continue;
      dropped.set(value.metricId, {
        ...value.metric,
        formulaOp: null,
        leftId: null,
        rightId: null,
      });
    }
  }
  return [...asked.map((f) => f.metric), ...dropped.values()];
}

/**
 * Every figure a period is reported with, as a series across every period on
 * record.
 *
 * A calculated field is worked out here from the fields it stands on rather
 * than read from the report, so it always agrees with them; which fields those
 * are is said on the chart. Two kinds of field are left out, both because a
 * series needs something to plot: dates, and anything the project has never
 * reported a figure for.
 */
function financialFigures(
  reports: FinancialReport[],
  asked: EquityPortfolioDTO["reportFields"],
  registry: EquityMetricDTO[],
) {
  // One lookup per period, so a field's value is found without rescanning.
  const byPeriod = reports.map(
    (report) => new Map(report.values.map((v) => [v.metricId, v.numberValue])),
  );

  return chartedFields(reports, asked)
    .filter((field) => !isDateMetric(field.type))
    .map((field) => {
      const formula = isFormulaMetric(field.type);

      const rows = reports.map((report, i) => {
        const numbers = byPeriod[i];
        const value = formula
          ? evaluateFormula(
              field.formulaOp,
              numbers.get(field.leftId ?? "") ?? null,
              numbers.get(field.rightId ?? "") ?? null,
            )
          : (numbers.get(field.id) ?? null);
        return {
          label: formatPeriodLabel(report.periodType, report.periodStart),
          value,
          display:
            value == null ? "—" : formatMetricValue(field, { numberValue: value }),
        };
      });

      return {
        label: field.name,
        /** "Revenue − Cost", for the fields nobody types in. */
        calculation: formula
          ? formulaLabel(
              field.formulaOp,
              registry.find((f) => f.id === field.leftId)?.name,
              registry.find((f) => f.id === field.rightId)?.name,
            )
          : null,
        rows,
        format: (value: number) =>
          formatMetricValue(field, { numberValue: value }),
      };
    })
    .filter((figure) => figure.rows.some((row) => row.value != null))
    // Coloured after the empty ones are gone, so the palette doesn't skip.
    .map((figure, index) => ({
      ...figure,
      color: SERIES[index % SERIES.length],
    }));
}

/** What the financials chart is standing on, in a line under the table. */
function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function financialsNote(figures: { label: string; calculation: string | null }[]) {
  const worked = figures.filter((f) => f.calculation);
  const reported = figures.filter((f) => !f.calculation).map((f) => f.label);

  const first =
    reported.length > 0
      ? `${reported.join(", ")} ${
          reported.length === 1 ? "is" : "are"
        } as the company reported them for the period.`
      : "";
  const second =
    worked.length > 0
      ? ` ${worked
          .map((f) => `${f.label} is ${f.calculation}`)
          .join(", and ")} — worked out here rather than entered, so it can't
          drift from the figures it stands on.`
      : "";
  const third =
    figures.length > 1
      ? " Every figure shares one axis, so a large one flattens the rest; click a name below the chart to take it off and let the others fill the space."
      : "";

  return `${first}${second}${third}`.replace(/\s+/g, " ").trim();
}

function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function day(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The performance readings turned inside out: stored as a reading per day, but
 * read as a metric over time. A metric only recorded once still gets a card —
 * it just has no line yet.
 */
function metricSeriesOf(portfolio: EquityPortfolioDTO): MetricSeries[] {
  const chronological = [...portfolio.performance].reverse();
  const series = new Map<string, MetricSeries>();

  for (const entry of chronological) {
    for (const value of entry.values) {
      const at = series.get(value.metricId) ?? {
        metric: value.metric,
        points: [],
        latest: "—",
        change: null,
      };

      const previous = at.points[at.points.length - 1]?.value ?? null;
      if (!isDateMetric(value.metric.type) && value.numberValue != null) {
        at.points.push({
          label: shortDay(entry.recordedOn),
          value: value.numberValue,
        });
        at.change = previous == null ? null : value.numberValue - previous;
      }

      // Later readings win: the list is in date order, so the last one seen is
      // the current position.
      at.latest = formatMetricValue(value.metric, value);
      at.metric = value.metric;
      series.set(value.metricId, at);
    }
  }

  return [...series.values()];
}

/**
 * The current split as slices of a cap table: rows under one name are one
 * holder's stake, since a name protected in stages is still one person on the
 * chart. Kept alongside the number of rows it came from and the stages the
 * stake breaks into — a fixed piece, or a protected tranche and the valuation
 * it holds to — so the chart and the table behind it can show the make-up of
 * the merge rather than hide it.
 */
function capTable(
  grants: {
    equityPct: number;
    structureType?: string;
    tranches?: { equityPct: number; startsAtValuation: number }[];
    holder: { name: string; isUs?: boolean } | null;
  }[],
) {
  const byHolder = new Map<
    string,
    {
      label: string;
      value: number;
      rows: number;
      isUs: boolean;
      parts: { value: number; protectedTo: number | null }[];
    }
  >();
  for (const g of grants) {
    const label = g.holder?.name ?? "Unassigned";
    const parts =
      g.structureType === "TRANCHED" && g.tranches?.length
        ? g.tranches.map((t) => ({
            value: t.equityPct,
            protectedTo: t.startsAtValuation,
          }))
        : [{ value: g.equityPct, protectedTo: null }];
    const at = byHolder.get(label) ?? {
      label,
      value: 0,
      rows: 0,
      isUs: g.holder?.isUs ?? false,
      parts: [],
    };
    at.value += g.equityPct;
    at.rows += 1;
    at.parts.push(...parts);
    byHolder.set(label, at);
  }
  return [...byHolder.values()]
    .map((s) => ({
      ...s,
      value: Math.round(s.value * 100) / 100,
      // Fixed pieces first, then the protected stages cheapest milestone
      // first — the order the protection gives way in as the company is
      // valued higher.
      parts: [...s.parts]
        .sort((a, b) => (a.protectedTo ?? -1) - (b.protectedTo ?? -1))
        .map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 })),
    }))
    .sort((a, b) => b.value - a.value);
}

/** How one stage of a stake reads — "Protected to 2,000,000 KWD", or "Fixed". */
function stageCaption(
  part: { protectedTo: number | null },
  currency: string,
) {
  return part.protectedTo != null
    ? `Protected to ${formatValuation(part.protectedTo, currency)}`
    : "Fixed";
}

/** The cap table as the donut draws it, stages captioned in the money. */
function splitSlices(rows: ReturnType<typeof capTable>, currency: string) {
  return rows.map((s) => ({
    label: s.label,
    value: s.value,
    isUs: s.isUs,
    parts:
      s.parts.length > 1
        ? s.parts.map((p) => ({
            value: p.value,
            sub: stageCaption(p, currency),
          }))
        : undefined,
  }));
}

/**
 * The cap table as the data view prints it: a line per name, and under a name
 * whose stake comes in stages, an indented line per stage with its own figure.
 */
function splitTableRows(
  rows: ReturnType<typeof capTable>,
  currency: string,
): React.ReactNode[][] {
  return rows.flatMap((s) => {
    const own: React.ReactNode[] = [s.label, formatPct(s.value)];
    if (s.parts.length <= 1) return [own];
    return [
      own,
      ...s.parts.map((p, i) => [
        <span key={i} className="block ps-4 text-muted-foreground">
          {stageCaption(p, currency)}
        </span>,
        <span key={i} className="text-muted-foreground/80">
          {formatPct(p.value)}
        </span>,
      ]),
    ];
  });
}

// ─── Layout pieces ──────────────────────────────────────

/** One module of the portfolio, boxed and headed by the module's own name. */
function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // Cleared past the page header, which is stuck to the top and would
    // otherwise cover what you jumped to.
    <section
      id={id}
      className="app-card scroll-mt-24 rounded-2xl border border-border bg-card/40 p-6 sm:p-7"
    >
      <div className="flex items-center gap-2 min-w-0 mb-7">
        <span
          className="grid place-items-center w-6 h-6 rounded-md shrink-0"
          style={{ background: `${ACCENT}1f`, color: ACCENT }}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        </span>
        <h2 className="text-m font-semibold text-foreground truncate">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** A field within a module, headed by the same name the form gives it. */
function Field({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-xs text-xs uppercase tracking-[0.1em] text-muted-foreground mb-3.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        {title}
      </p>
      {children}
    </div>
  );
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // A shade lighter than the section box it sits in, so nested cards read
        // as tiles inside a panel rather than boxes inside boxes.
        "app-card rounded-xl border border-border/60 bg-muted/20 p-5 transition-colors hover:border-muted-foreground/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

function HeadlineStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="app-card rounded-xl border border-border/60 bg-muted/20 px-4 py-4 transition-colors hover:border-muted-foreground/30">
      <div className="flex items-center gap-xs mb-2.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: ACCENT }} />
        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-l font-semibold text-foreground tabular-nums leading-none">
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}

/**
 * One tracked metric: where it stands, which way it moved, and the shape of how
 * it got there. A date metric is a milestone rather than a series, so it gets
 * the date and nothing else.
 */
function MetricCard({ series, index }: { series: MetricSeries; index: number }) {
  const { metric, points, latest, change } = series;
  const color = seriesColor(index + 1);
  const up = change != null && change > 0;
  const down = change != null && change < 0;
  // Stable, so the chart isn't rebuilt every time the deck re-renders.
  const format = useCallback(
    (value: number) => formatMetricValue(metric, { numberValue: value }),
    [metric],
  );

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          {metric.name}
        </p>
        {change != null && change !== 0 && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium tabular-nums shrink-0",
              up && "text-success",
              down && "text-destructive",
            )}
          >
            {up ? (
              <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
            ) : (
              <ArrowDownRight className="w-3 h-3" strokeWidth={2} />
            )}
            {format(Math.abs(change))}
          </span>
        )}
      </div>

      <p className="text-l font-semibold text-foreground tabular-nums leading-none mt-3">
        {latest}
      </p>

      {points.length > 1 ? (
        <div className="mt-4 -mx-1">
          <MetricSpark points={points} color={color} format={format} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70 mt-3.5">
          {isDateMetric(metric.type)
            ? "Milestone"
            : "One reading so far — record it again to see the trend"}
        </p>
      )}
    </Panel>
  );
}

/** A body of text from the deck, given room to be read. */
/**
 * A team member's photo, filling the card it sits in. Square rather than the
 * small circle used in the tables — this is the one place people are the
 * subject rather than a row, and a face worth putting in a pitch is worth
 * seeing.
 */
function TeamPhoto({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  return (
    <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted/40 mb-3">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full grid place-items-center bg-primary/10 text-m font-semibold text-primary">
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </div>
      )}
    </div>
  );
}

/**
 * One person on the team. A bio can run to paragraphs, and a card that long
 * drags the whole grid with it — so the card shows three lines, and clicking
 * them opens an overlay with the person in full.
 */
function TeamMemberPanel({
  name,
  photoUrl,
  title,
  bio,
  linkedinUrl,
}: {
  name: string;
  photoUrl: string | null;
  title: string | null;
  bio: string | null;
  linkedinUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  // Whether the three-line clamp actually cut anything — measured, since a
  // character count guesses wrong at every column width.
  useEffect(() => {
    const el = bioRef.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bio]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkedin = linkedinUrl && (
    <a
      href={linkedinUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-underline mt-4 transition-colors"
    >
      <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
      LinkedIn
    </a>
  );

  return (
    <Panel className="text-center">
      <TeamPhoto name={name} photoUrl={photoUrl} />
      <p className="text-s font-semibold text-foreground">{name}</p>
      {title && (
        <p className="text-xs mt-1.5" style={{ color: ACCENT }}>
          {title}
        </p>
      )}
      {bio && (
        <p
          ref={bioRef}
          onClick={clamped ? () => setOpen(true) : undefined}
          className={cn(
            "text-xs text-muted-foreground mt-3.5 whitespace-pre-wrap line-clamp-3",
            clamped && "cursor-pointer",
          )}
        >
          {bio}
        </p>
      )}
      {linkedin && <div>{linkedin}</div>}
      {bio && clamped && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block mx-auto text-xs font-medium text-foreground/70 hover:text-foreground mt-2 transition-colors"
        >
          Read more
        </button>
      )}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={name}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border/60 bg-background p-6 text-start"
            >
              <div className="flex items-start gap-4">
                <div className="w-20 shrink-0">
                  <TeamPhoto name={name} photoUrl={photoUrl} />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-s font-semibold text-foreground">
                    {name}
                  </p>
                  {title && (
                    <p className="text-s mt-1" style={{ color: ACCENT }}>
                      {title}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-2 -m-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-s leading-relaxed text-muted-foreground whitespace-pre-wrap mt-4">
                {bio}
              </p>
              {linkedin}
            </div>
          </div>,
          document.body,
        )}
    </Panel>
  );
}

/**
 * A module, or a field of one, with nothing in it. Said rather than left out:
 * a report that skips what it hasn't got reads as complete when it isn't, and
 * the gap is often the thing worth seeing.
 */
function NoData({ children = "No data" }: { children?: React.ReactNode }) {
  return (
    <Panel className="border-dashed">
      <p className="text-s text-muted-foreground">{children}</p>
    </Panel>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <Panel>
      <p className="text-s leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {text}
      </p>
    </Panel>
  );
}

/**
 * The channels, as a split of the reach between them.
 *
 * Only drawn where every channel has been given a share — a chart of parts of
 * a whole can't be built from some of the parts. Until then the channels are
 * listed as they were written, which is what they were before shares existed.
 */
function Adoption({
  channels,
}: {
  channels: NonNullable<EquityPortfolioDTO["opportunity"]>["items"];
}) {
  const shared = channels.filter((c) => c.share != null);
  const split = shared.length === channels.length;

  // Largest first, which is the order the key under the chart reads in; the
  // chart puts them round the other way to make the spiral.
  const slices = [...channels]
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
    .map((c) => ({
      label: c.heading || "—",
      value: c.share ?? 0,
      sub: c.body ?? undefined,
    }));

  if (!split) {
    return (
      <div className="grid grid-cols-1 @md/card:grid-cols-2 gap-x-4 gap-y-6">
        {channels.map((c) => (
          <Panel key={c.id}>
            <p className="text-s font-semibold text-foreground">
              {c.heading}
            </p>
            <p className="text-s text-muted-foreground mt-2.5 whitespace-pre-wrap">
              {c.body}
            </p>
          </Panel>
        ))}
      </div>
    );
  }

  return (
    <ChartFrame
      title="Where the reach comes from"
      note="Each channel's share of the reach, as entered on the portfolio page — the shares have to come to 100% before that section will save, so the split is of the whole and nothing is left out. The slices are cut to their share and drawn to a radius that follows it, so the biggest channel reaches furthest out; the shading follows the same figure."
      source={`Market adoption · ${channels.length} ${
        channels.length === 1 ? "channel" : "channels"
      }`}
      data={{
        columns: ["Channel", "Share", "How we reach it"],
        rows: channels.map((c) => [
          c.heading || "—",
          `${c.share}%`,
          c.body || "—",
        ]),
      }}
    >
      <RosePie slices={slices} />
    </ChartFrame>
  );
}

/**
 * The milestones, in a panel that scrolls with the count of where you are in
 * it up beside the title — the one section long enough to need saying.
 */
function Traction({
  milestones,
}: {
  milestones: EquityPortfolioDTO["milestones"];
}) {
  const [progress, setProgress] = useState<TractionProgress>({
    at: 0,
    scrolls: false,
  });

  // Newest at the top: the latest step is the news, the early ones are
  // history. The step numbers still count from the beginning, so Step 01
  // stays the first thing that ever happened.
  const ordered = useMemo(() => [...milestones].reverse(), [milestones]);

  return (
    <ChartFrame
      title="Milestones, newest first"
      note="Every milestone as it was entered on the portfolio page, with the day it happened, newest first. Anything dated after today is shown as upcoming rather than achieved."
      source={`Traction · ${ordered.length} ${
        ordered.length === 1 ? "milestone" : "milestones"
      }, newest first`}
      data={{
        columns: ["Date", "Milestone", "Detail"],
        rows: ordered.map((m) => [
          day(m.happenedOn) ?? "—",
          m.title,
          m.body || "—",
        ]),
      }}
      aside={
        progress.scrolls && (
          <TractionCount at={progress.at} total={ordered.length} />
        )
      }
    >
      <TractionTimeline milestones={ordered} onProgress={setProgress} />
    </ChartFrame>
  );
}

// ─── The pitch ──────────────────────────────────────────

export function PortfolioPitch({
  portfolio,
  fields,
}: {
  portfolio: EquityPortfolioDTO;
  /** The registry, for the financial fields a period is reported with. */
  fields: EquityMetricDTO[];
}) {
  const currency = portfolio.valuationCurrency;
  const { granted, held, vested } = useMemo(
    () => computePortfolioEquity(portfolio),
    [portfolio],
  );
  const latest = currentSet(portfolio.sets);
  const valuation = latest?.valuation ?? null;
  const heldWorth = equityValueAt(held, valuation);
  const opportunity = portfolio.opportunity;
  const description = portfolio.project.description;

  const businessModel = itemsOf(portfolio, "BUSINESS_MODEL");
  const adoption = itemsOf(portfolio, "MARKET_ADOPTION");
  const competition = itemsOf(portfolio, "COMPETITION");
  // The radar draws once there are anchors and at least one score against
  // them; competition entered before either falls back to the old quadrant.
  const radarAnchors = portfolio.opportunity?.radarAnchors ?? [];
  const radarScored = competition.some(
    (c) => c.scores && radarAnchors.some((a) => c.scores?.[a] != null),
  );
  // The deck shows the team as it stands; the lineups behind it are dated and
  // kept, and the section says how many there are rather than listing them.
  const team = portfolio.teamSnapshots[0];
  const teamHistory = Math.max(portfolio.teamSnapshots.length - 1, 0);
  // Only tiers with a figure appear in the report: one left empty is left out
  // of the drawing and the table, and with none filled in the section says
  // "No data" rather than drawing nothing.
  const marketTiers = portfolio.marketTiers.filter((t) => marketAmount(t) > 0);
  const productPhotos = portfolio.productPhotos;
  const milestones = portfolio.milestones;

  const slices = capTable(latest?.grants ?? []);

  // The chart draws the split in force today; every split before it is kept, so
  // the data view can step back through them.
  const pastSplits = portfolio.sets.filter((s) => s.id !== latest?.id);

  // Oldest first, so dilution reads left to right.
  const splits = useMemo(() => [...portfolio.sets].reverse(), [portfolio.sets]);
  const trend = useMemo(
    () =>
      splits
        .map((s) => ({
          label: new Date(s.effectiveOn).toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          }),
          value: Math.round((ourPctIn(s) ?? 0) * 100) / 100,
          caption:
            s.valuation != null
              ? formatValuation(s.valuation, currency)
              : undefined,
        }))
        .filter((p) => p.value > 0),
    [splits, currency],
  );

  const valuationTrend = useMemo(
    () =>
      splits
        .filter((s) => s.valuation != null)
        .map((s) => ({
          label: new Date(s.effectiveOn).toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          }),
          value: s.valuation as number,
          caption: formatValuation(s.valuation, currency),
        })),
    [splits, currency],
  );

  const reports = useMemo(
    () => [...portfolio.financialReports].reverse(),
    [portfolio.financialReports],
  );

  // Every defined financial field as a series, and the periods they share.
  const figures = useMemo(
    () => financialFigures(reports, portfolio.reportFields, fields),
    [reports, portfolio.reportFields, fields],
  );
  const periodLabels = useMemo(
    () =>
      reports.map((r) => formatPeriodLabel(r.periodType, r.periodStart)),
    [reports],
  );
  // The statements uploaded with the periods, kept in the same oldest-first
  // order as the chart so the two read together.
  const documented = useMemo(
    () =>
      reports
        .map((r, i) => ({
          id: r.id,
          label: periodLabels[i],
          documents: r.documents,
        }))
        .filter((r) => r.documents.length > 0),
    [reports, periodLabels],
  );

  const metrics = useMemo(() => metricSeriesOf(portfolio), [portfolio]);
  const lastReading = portfolio.performance[0] ?? null;

  return (
    <div className="lg:flex lg:items-start lg:gap-8 pb-16">
      <SectionRail sections={SECTIONS} />

      <div className="min-w-0 flex-1 space-y-8">
        <section id="overview" className="scroll-mt-24">
          <Hero
            portfolio={portfolio}
            held={held}
            granted={granted}
            vested={vested}
            valuation={valuation}
            heldWorth={heldWorth}
            currency={currency}
          />
        </section>

        {/* ── Opportunity: the case itself, as written ── */}
        <Section
          id="opportunity"
          icon={Lightbulb}
          title="Opportunity"
        >
          <div className="space-y-10">
            <Field icon={Rocket} title="Launch">
              {portfolio.liveDate ? (
                <Panel>
                  <p className="text-s text-foreground">
                    {formatLiveStatus(portfolio.liveDate)}
                  </p>
                </Panel>
              ) : (
                <NoData />
              )}
            </Field>

            <Field icon={AlignLeft} title="Description">
              {description ? <Prose text={description} /> : <NoData />}
            </Field>

            <Field icon={AlertCircle} title="The problem">
              {opportunity?.problem ? (
                <Prose text={opportunity.problem} />
              ) : (
                <NoData />
              )}
            </Field>

            <Field icon={Lightbulb} title="The solution">
              {opportunity?.solution ? (
                <Prose text={opportunity.solution} />
              ) : (
                <NoData />
              )}
            </Field>
          </div>
        </Section>

        {/* ── The product: the write-up, then the shots of it ── */}
        <Section
          id="product"
          icon={Package}
          title="The product"
        >
          {!opportunity?.product && productPhotos.length === 0 ? (
            <NoData />
          ) : (
            <div className="space-y-8">
              {opportunity?.product && <Prose text={opportunity.product} />}
              {productPhotos.length > 0 && (
                <PhotoGallery
                  photos={productPhotos}
                  className="grid-cols-1 @md/card:grid-cols-2 @lg/card:grid-cols-3"
                  defaultColumns={3}
                />
              )}
            </div>
          )}
        </Section>

        {/* ── Market size: the tiers, drawn inside one another to scale ── */}
        <Section
          id="market"
          icon={Globe2}
          title="Market size"
        >
          {marketTiers.length === 0 ? (
            <NoData />
          ) : (
            <ChartFrame
              title="How big the market is"
              note="Each tier is drawn inside the one above it — TAM, then SAM, then SOM. The circles are fixed in size; the amounts are what the labels and the table say. A tier left without a figure is left out entirely."
              source="Market size"
              data={{
                columns: ["Name", "Amount"],
                rows: marketTiers.map((t) => [
                  marketTierName(t.tier),
                  formatMarketAmount(t),
                ]),
              }}
            >
              <MarketRings
                tiers={marketTiers.map((t) => ({
                  tier: t.tier,
                  display: formatMarketAmount(t),
                  value: marketAmount(t),
                }))}
              />
            </ChartFrame>
          )}
        </Section>

        {/* ── Business model ── */}
        <Section
          id="business-model"
          icon={Coins}
          title="Business model"
        >
          {businessModel.length === 0 ? (
            <NoData />
          ) : (
            <div className="grid grid-cols-1 @md/card:grid-cols-2 gap-x-4 gap-y-6">
              {businessModel.map((b, i) => (
                <Panel key={b.id}>
                  <p
                    className="text-l font-bold tabular-nums"
                    style={{ color: seriesColor(i) }}
                  >
                    {formatMarketAmount(b)}
                  </p>
                  <p className="text-s text-foreground/90 mt-1.5">
                    {b.heading}
                  </p>
                </Panel>
              ))}
            </div>
          )}
        </Section>

        {/* ── Market adoption ── */}
        <Section id="adoption" icon={Megaphone} title="Market adoption">
          {adoption.length === 0 ? <NoData /> : <Adoption channels={adoption} />}
        </Section>

        {/* ── Traction: what has happened, on the dates it happened ── */}
        <Section id="traction" icon={Flag} title="Traction">
          {milestones.length === 0 ? <NoData /> : <Traction milestones={milestones} />}
        </Section>

        {/* ── Competition ── */}
        <Section
          id="competition"
          icon={Target}
          title="Competition"
        >
          {competition.length === 0 ? (
            <NoData />
          ) : radarAnchors.length >= 3 && radarScored ? (
            <ChartFrame
              title="How everyone measures up"
              note="Every player scored 0–10 by hand against the anchors this market is fought on — the anchors are the portfolio's own, picked in the Competition module. Nothing here is measured; it's the read we're putting our name to, and ours is the pink shape."
              source={`Competition · ${radarAnchors.length} anchors`}
              data={{
                columns: ["Who", ...radarAnchors],
                rows: competition.map((c) => [
                  `${c.heading || "—"}${c.isUs ? " (us)" : ""}`,
                  ...radarAnchors.map((a) => c.scores?.[a] ?? "—"),
                ]),
              }}
            >
              <RadarChart
                anchors={radarAnchors}
                series={competition.map((c) => ({
                  label: c.heading || "—",
                  values: radarAnchors.map((a) => c.scores?.[a] ?? null),
                  isUs: c.isUs,
                }))}
              />
            </ChartFrame>
          ) : (
            // Entered before the radar existed: the old quadrant reads as it
            // did, until the rows are scored against anchors.
            <ChartFrame
              title="Where everyone sits"
              note="Every competitor is placed by hand on two scales running −100 to 100: offline to online across, costly to cheap up. Nothing here is measured — it's the read we're putting our name to, and ours is the marked point."
              source="Competition"
              data={{
                columns: ["Who", "Offline → online", "Costly → cheap"],
                rows: competition.map((c) => [
                  `${c.heading || "—"}${c.isUs ? " (us)" : ""}`,
                  c.axisX ?? 0,
                  c.axisY ?? 0,
                ]),
              }}
            >
              <QuadrantChart
                points={competition.map((c) => ({
                  label: c.heading || "—",
                  x: c.axisX ?? 0,
                  y: c.axisY ?? 0,
                  isUs: c.isUs,
                }))}
                xLow="Offline"
                xHigh="Online"
                yLow="Costly"
                yHigh="Cheap"
              />
            </ChartFrame>
          )}
        </Section>

        {/* ── Team: the lineup in force, with the earlier ones behind it ── */}
        <Section
          id="team"
          icon={Users}
          title="Team"
        >
          {!team ? (
            <NoData />
          ) : (
            <>
              {teamHistory > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {teamHistory} earlier{" "}
                  {teamHistory === 1 ? "lineup is" : "lineups are"} on record.
                </p>
              )}
              <div className="grid grid-cols-1 @md/card:grid-cols-2 @lg/card:grid-cols-3 gap-x-4 gap-y-6">
                {team.members.map((m) => (
                  <TeamMemberPanel
                    key={m.id}
                    name={m.holder.name}
                    photoUrl={m.holder.photoUrl}
                    title={m.role?.name ?? m.title}
                    bio={m.body || m.holder.bio}
                    linkedinUrl={m.holder.linkedinUrl}
                  />
                ))}
              </div>
            </>
          )}
        </Section>

        {/* ── Equity ── */}
        <Section
          id="equity"
          icon={PieChart}
          title="Equity"
        >
          {slices.length === 0 ? (
            <NoData />
          ) : (
            // One chart per row: each gets the full width of the module box,
            // so nothing is read squeezed into half a column.
            <div className="space-y-6">
              <ChartFrame
                title="The split"
                note="Every row of the current split, added up per name — a stake protected in stages holds several rows but is one holder on the chart, drawn as one slice divided into its stages. Each stage is listed under its name here with the valuation it holds to. The centre is our own share of the same split."
                source={
                  latest
                    ? `Equity · split effective ${day(latest.effectiveOn)} · ${
                        latest.grants.length
                      } ${latest.grants.length === 1 ? "row" : "rows"}`
                    : "Equity"
                }
                data={{
                  columns: ["Name", "Equity"],
                  rows: splitTableRows(slices, currency),
                }}
                history={pastSplits.map((s) => ({
                  label: day(s.effectiveOn) ?? "Earlier",
                  note: `The split that was in force from ${day(
                    s.effectiveOn,
                  )}, added up per name the same way. Superseded splits are kept rather than overwritten, so what was agreed then still reads as it did.`,
                  source: `Equity · split effective ${day(s.effectiveOn)} · ${
                    s.grants.length
                  } ${s.grants.length === 1 ? "row" : "rows"}${
                    s.valuation != null
                      ? ` · valued ${formatValuation(s.valuation, currency)}`
                      : ""
                  }`,
                  data: {
                    columns: ["Name", "Equity"],
                    rows: splitTableRows(capTable(s.grants), currency),
                  },
                }))}
              >
                <DonutChart
                  slices={splitSlices(slices, currency)}
                  total={100}
                  centerLabel={formatPct(held)}
                />
              </ChartFrame>

              {trend.length > 1 ? (
                <ChartFrame
                  title="Our stake across every split"
                  note="Our rows in each dated split, as a share of that split's 100%. Earlier splits are kept as history, so the line is the record of what we held on each date rather than a projection."
                  source={`Equity · ${splits.length} ${
                    splits.length === 1 ? "split" : "splits"
                  }, oldest first`}
                  data={{
                    columns: ["Effective", "Our stake", "Valuation", "Worth"],
                    rows: splits.map((s) => {
                      const pct = ourPctIn(s);
                      return [
                        day(s.effectiveOn) ?? "—",
                        formatPct(pct),
                        s.valuation != null
                          ? formatValuation(s.valuation, currency)
                          : "—",
                        s.valuation != null && pct != null
                          ? formatValuation(
                              Math.round(equityValueAt(pct, s.valuation) ?? 0),
                              currency,
                            )
                          : "—",
                      ];
                    }),
                  }}
                >
                  <TrendChart points={trend} />
                </ChartFrame>
              ) : (
                <div className="grid grid-cols-2 @md/card:grid-cols-4 gap-x-4 gap-y-6">
                  <HeadlineStat
                    icon={PieChart}
                    label="Our stake"
                    value={formatPct(held)}
                  />
                  <HeadlineStat
                    icon={CheckCircle2}
                    label="Vested"
                    value={formatPct(vested)}
                  />
                </div>
              )}

              {valuationTrend.length > 1 && (
                <ChartFrame
                  title="Valuation across every split"
                  note={`The valuation entered with each split, in ${currency}. Nothing here is derived — it's the number agreed at the time, and what our stake was worth is that figure times our share on the same date.`}
                  source={`Equity · ${valuationTrend.length} valued splits`}
                  data={{
                    columns: ["Effective", "Valuation", "Our stake", "Worth"],
                    rows: splits
                      .filter((s) => s.valuation != null)
                      .map((s) => {
                        const pct = ourPctIn(s);
                        return [
                          day(s.effectiveOn) ?? "—",
                          formatValuation(s.valuation, currency),
                          formatPct(pct),
                          pct != null
                            ? formatValuation(
                                Math.round(equityValueAt(pct, s.valuation) ?? 0),
                                currency,
                              )
                            : "—",
                        ];
                      }),
                  }}
                >
                  <TrendChart
                    points={valuationTrend}
                    format={(v) => formatValuation(v, currency)}
                    axisFormat={compactNumber}
                  />
                </ChartFrame>
              )}
            </div>
          )}
        </Section>

        {/* ── Financials: every reported figure, period by period ── */}
        <Section
          id="financials"
          icon={BarChart3}
          title="Financials"
        >
          {figures.length === 0 ? (
            <NoData>
              {reports.length === 0
                ? "No data"
                : `No figures reported for ${
                    reports.length === 1 ? "this period" : "these periods"
                  } yet.`}
            </NoData>
          ) : (
            <ChartFrame
              title="Every reported figure, period by period"
              note={financialsNote(figures)}
              source={`Financials · ${reports.length} ${
                reports.length === 1 ? "period" : "periods"
              }, oldest first`}
              data={{
                columns: ["Period", ...figures.map((f) => f.label)],
                rows: periodLabels.map((label, i) => [
                  label,
                  ...figures.map((f) => f.rows[i]?.display ?? "—"),
                ]),
              }}
            >
              <SeriesArea
                labels={periodLabels}
                series={figures.map((figure) => ({
                  name: figure.label,
                  color: figure.color,
                  values: figure.rows.map((row) => row.value),
                  format: figure.format,
                }))}
                format={compactNumber}
                axisFormat={compactNumber}
                // The trend charts' plot area, plus the room this one gives up
                // to the legend along its foot, so the two draw the same size.
                height={402}
              />
            </ChartFrame>
          )}

          {/* The statements the figures were reported from, period by period.
              Every claim above has its paperwork here. */}
          {documented.length > 0 && (
            <Panel className="mt-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Reported documents
              </p>
              <div className="space-y-2.5">
                {documented.map((period) => (
                  <div
                    key={period.id}
                    className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4"
                  >
                    <span className="text-s font-medium text-foreground/80 tabular-nums w-20 shrink-0">
                      {period.label}
                    </span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 min-w-0">
                      {period.documents.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-xs text-s text-foreground/90 no-underline hover:underline min-w-0"
                        >
                          <Paperclip
                            className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                            strokeWidth={1.5}
                          />
                          <span className="truncate">{doc.filename}</span>
                          {formatFileSize(doc.fileSize) && (
                            <span className="text-xs text-muted-foreground/60 shrink-0">
                              {formatFileSize(doc.fileSize)}
                            </span>
                          )}
                        </a>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </Section>

        {/* ── Performance ── */}
        <Section
          id="performance"
          icon={Activity}
          title="Performance"
        >
          {metrics.length === 0 ? (
            <NoData />
          ) : (
            <ChartFrame
              title="Tracked data points"
              note="One column per data point defined under Performance data, one row per reading. Each card shows the newest reading, and the figure beside it is the difference from the reading before — not a rate, just the step between the last two."
              source={
                lastReading
                  ? `Performance · ${portfolio.performance.length} readings · last recorded ${day(lastReading.recordedOn)}`
                  : "Performance"
              }
              data={{
                columns: ["Reading", ...metrics.map((m) => m.metric.name)],
                rows: [...portfolio.performance].map((entry) => [
                  day(entry.recordedOn) ?? "—",
                  ...metrics.map((m) => {
                    const value = entry.values.find(
                      (v) => v.metricId === m.metric.id,
                    );
                    return value ? formatMetricValue(value.metric, value) : "—";
                  }),
                ]),
              }}
            >
              <div className="grid grid-cols-1 @md/card:grid-cols-2 @lg/card:grid-cols-3 gap-x-4 gap-y-6">
                {metrics.map((series, i) => (
                  <MetricCard key={series.metric.id} series={series} index={i} />
                ))}
              </div>
            </ChartFrame>
          )}
        </Section>

      </div>
    </div>
  );
}

function Hero({
  portfolio,
  held,
  granted,
  vested,
  valuation,
  heldWorth,
  currency,
}: {
  portfolio: EquityPortfolioDTO;
  held: number | null;
  granted: number | null;
  vested: number | null;
  valuation: number | null;
  heldWorth: number | null;
  currency: string;
}) {
  const live = portfolio.liveDate ? liveStatus(portfolio.liveDate) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/40 px-6 py-7 sm:px-7">
      {/* A wash of the brand colour behind the title, so the top of the deck
          reads as a cover rather than as the first of many cards. */}
      <div
        aria-hidden
        className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: ACCENT }}
      />

      <div className="relative flex items-start gap-4">
        {portfolio.project.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portfolio.project.logoUrl}
            alt=""
            className="w-12 h-12 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-primary/15 grid place-items-center text-m font-semibold text-primary shrink-0">
            {portfolio.project.name[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-m font-bold tracking-tight text-foreground">
              {portfolio.project.name}
            </h1>
            {portfolio.liveDate && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-semibold",
                  live === "LIVE"
                    ? "bg-success/15 text-success"
                    : "bg-orange/15 text-orange",
                )}
              >
                {formatLiveStatus(portfolio.liveDate)}
              </span>
            )}
          </div>
          {/* The description itself lives under Opportunity, where it's edited,
              rather than being repeated a box above it. */}
          <p className="text-xs text-muted-foreground mt-1">
            Equity portfolio · reported in {currency}
          </p>
        </div>
      </div>

      <div className="relative grid grid-cols-2 @md/card:grid-cols-4 gap-x-4 gap-y-5 mt-8">
        <HeadlineStat
          icon={PieChart}
          label={held !== granted ? "Equity today" : "Our equity"}
          value={formatPct(held)}
          sub={held !== granted ? `${formatPct(granted)} granted` : undefined}
        />
        <HeadlineStat
          icon={CheckCircle2}
          label="Vested"
          value={formatPct(vested)}
        />
        <HeadlineStat
          icon={Coins}
          label="Valuation"
          value={valuation != null ? formatValuation(valuation, currency) : "—"}
        />
        <HeadlineStat
          icon={TrendingUp}
          label="Our stake is worth"
          value={
            heldWorth != null
              ? formatValuation(Math.round(heldWorth), currency)
              : "—"
          }
        />
      </div>
    </div>
  );
}

/**
 * Whichever section is highest on screen but still below the header — the one
 * you're reading rather than the one you've scrolled past.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  // Watched by value: the list is rebuilt each render but rarely changes.
  const key = ids.join("|");

  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    const tops = new Map<string, number>();

    // A short last section may never climb into the band before the page runs
    // out of scroll, so the bottom of the page counts as reading it.
    const atEnd = () =>
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 2;

    const pick = () => {
      if (atEnd() && list.length > 0) {
        setActive(list[list.length - 1]);
        return;
      }
      let best: string | null = null;
      let bestTop = Number.POSITIVE_INFINITY;
      for (const [id, top] of tops) {
        if (top < bestTop) {
          best = id;
          bestTop = top;
        }
      }
      if (best) setActive(best);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          tops.set(
            entry.target.id,
            entry.isIntersecting
              ? entry.boundingClientRect.top
              : Number.POSITIVE_INFINITY,
          );
        }
        pick();
      },
      // The band the "current" section has to be in: below the sticky header,
      // above the bottom half of the screen.
      { rootMargin: "-88px 0px -60% 0px", threshold: 0 },
    );

    for (const id of list) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    window.addEventListener("scroll", pick, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, [key]);

  return active;
}

/**
 * The rail down the side of the deck: the portfolio's modules in reading order,
 * marking where you are as you scroll and jumping you where you click. Below a
 * wide screen there's no room beside the deck, so it lies across the top.
 */
function SectionRail({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const ids = sections.map((s) => s.id);
  const active = useActiveSection(ids) ?? sections[0]?.id;

  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <nav className="hidden lg:block sticky top-16 w-44 shrink-0">
        <ul className="space-y-0.5">
          {sections.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "w-full flex items-center gap-2 ps-2 pe-2 py-1.5 rounded-md text-start border-s-2 transition-colors",
                    on
                      ? "border-s-current bg-muted/50 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  )}
                  style={on ? { color: ACCENT } : undefined}
                >
                  <span
                    className={cn(
                      "text-s truncate",
                      on && "font-medium text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="lg:hidden sticky top-12 z-10 -mx-1 mb-6 px-1 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-xs overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={cn(
                "px-2.5 h-7 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                active === s.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
