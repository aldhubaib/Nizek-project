"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ECharts, EChartsOption } from "echarts";
import { EChart } from "@/components/charts/echart";
import { cn } from "@/lib/utils";

/**
 * The charts the pitch is drawn with, on Apache ECharts.
 *
 * Everything here is meant to be poked at rather than looked at: series answer
 * on hover, legends pick things out, and a long series can be dragged through.
 * The theme is set here rather than per chart — the app has one dark palette,
 * and a chart that brings its own would stand out as a foreign object.
 */

/** Enough hues to tell one holder from another, with ours always first. */
export const SERIES = [
  "#ff3366",
  "#22d3ee",
  "#a78bfa",
  "#4ade80",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
];

export function seriesColor(i: number) {
  return SERIES[i % SERIES.length];
}

const TEXT = "#8a8a8a";
const FOREGROUND = "#ededed";
const GRID_LINE = "rgba(255,255,255,0.06)";
const CARD = "#0a0a0a";

const AXIS_LABEL = { color: TEXT, fontSize: 10 } as const;

const TOOLTIP = {
  backgroundColor: "rgba(12,12,14,0.96)",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: 1,
  padding: [7, 10] as [number, number],
  textStyle: { color: FOREGROUND, fontSize: 12 },
  extraCssText:
    "border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);backdrop-filter:blur(6px);",
} as const;

/** Axes with nothing on them but the numbers — no frame, no ticks. */
const BARE_AXIS = {
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: GRID_LINE } },
} as const;

export type Slice = {
  label: string;
  value: number;
  sub?: string;
  /** Ours, which is drawn in the house pink wherever it lands in the order. */
  isUs?: boolean;
};

/**
 * The colour each slice is drawn in. Our own stake keeps the accent whatever
 * its size, since the whole deck marks us in that pink and a chart that gave it
 * to whoever happened to be largest would be read wrongly at a glance. The rest
 * take the other hues in order. With nobody named as us there's nothing to
 * reserve, and the palette is used from the top.
 */
function sliceColors(slices: Slice[]) {
  if (!slices.some((s) => s.isUs)) return slices.map((_, i) => seriesColor(i));
  let other = 0;
  return slices.map((s) =>
    s.isUs ? SERIES[0] : SERIES[1 + (other++ % (SERIES.length - 1))],
  );
}

export type LegendEntry = {
  label: string;
  color: string;
  /** The figure at the end of the line, written out — "45%", "SAR 1.2M". */
  value?: string;
  /** A word or two after the name, in the quiet colour. */
  sub?: string;
  /** Clicked off the chart, where the chart lets you do that. */
  off?: boolean;
};

/**
 * The key under a chart, written here rather than left to the library so every
 * chart in the report is read the same way: one row of chips, centred, each
 * naming a colour and carrying its figure.
 *
 * Hover and click are both optional — a key that can't do anything is still
 * drawn the same, so the charts don't drift apart in looks over what they
 * happen to let you do to them.
 */
export function ChartLegend({
  entries,
  active,
  onActive,
  onToggle,
}: {
  entries: LegendEntry[];
  /** Which line is lit, where the chart and the key share a hover. */
  active?: number | null;
  onActive?: (index: number | null) => void;
  /** Given, each line becomes a button that takes its series off the chart. */
  onToggle?: (index: number) => void;
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-3 gap-y-2 list-none p-0 m-0">
      {entries.map((e, i) => {
        const Tag = onToggle ? "button" : "span";
        return (
          <li key={e.label + i}>
            <Tag
              type={onToggle ? "button" : undefined}
              onClick={onToggle ? () => onToggle(i) : undefined}
              aria-pressed={onToggle ? !e.off : undefined}
              onMouseEnter={() => onActive?.(i)}
              onMouseLeave={() => onActive?.(null)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1 transition-colors",
                onToggle ? "cursor-pointer" : "cursor-default",
                active === i && "bg-muted/60",
                e.off && "opacity-40",
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: e.color }}
              />
              <span className="text-[12px] text-foreground text-left">
                {e.label}
                {e.sub && <span className="text-muted-foreground"> · {e.sub}</span>}
              </span>
              {e.value && (
                <span className="text-[12px] font-medium text-foreground tabular-nums">
                  {e.value}
                </span>
              )}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ownership as a ring, with the piece under the cursor named in the middle.
 * The legend under it is ours rather than the library's so it can carry each
 * holder's percentage; hovering either side lights up the other.
 */
export function DonutChart({
  slices,
  total,
  centerLabel,
}: {
  slices: Slice[];
  /** What the ring adds up to; 100 for a cap table, even if the rows don't. */
  total: number;
  centerLabel: string;
}) {
  const [chart, setChart] = useState<ECharts | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const allocated = slices.reduce((sum, s) => sum + s.value, 0);
  const unallocated = Math.round((total - allocated) * 100) / 100;
  const colors = useMemo(() => sliceColors(slices), [slices]);

  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 600,
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as { marker: string; name: string; value: number };
          return `${p.marker} ${p.name} &nbsp;<b>${p.value}%</b>`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["62%", "92%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderColor: CARD, borderWidth: 4, borderRadius: 6 },
          emphasis: {
            scaleSize: 7,
            itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,0,0,0.5)" },
          },
          data: [
            ...slices.map((s, i) => ({
              name: s.label,
              value: s.value,
              itemStyle: { color: colors[i] },
            })),
            ...(unallocated > 0.01
              ? [
                  {
                    name: "Unallocated",
                    value: unallocated,
                    itemStyle: { color: "rgba(255,255,255,0.07)" },
                  },
                ]
              : []),
          ],
        },
      ],
    }),
    [slices, colors, unallocated],
  );

  // Hovering the ring names the slice in the middle, the same as hovering its
  // line in the legend does — one piece of state, whichever side it came from.
  const onReady = useCallback((instance: ECharts) => {
    setChart(instance);
    instance.on("mouseover", { seriesIndex: 0 }, (event) => {
      setActive((event as { dataIndex: number }).dataIndex);
    });
    instance.on("globalout", () => setActive(null));
  }, []);

  useEffect(() => {
    if (!chart) return;
    if (active == null) {
      chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    } else {
      chart.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: active,
      });
    }
  }, [chart, active]);

  const shown = active != null ? slices[active] : null;

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="relative w-full max-w-[368px]">
        <EChart option={option} height={368} onReady={onReady} />
        <div className="absolute inset-0 grid place-items-center text-center px-16 pointer-events-none">
          <div>
            <p className="text-[34px] font-semibold text-foreground tabular-nums leading-none">
              {shown ? `${shown.value}%` : centerLabel}
            </p>
            <p className="text-[13px] text-muted-foreground mt-2.5 truncate">
              {shown ? shown.label : "of the company"}
            </p>
          </div>
        </div>
      </div>

      <ChartLegend
        entries={slices.map((s, i) => ({
          label: s.label,
          color: colors[i],
          value: `${s.value}%`,
          sub: s.sub,
        }))}
        active={active}
        onActive={setActive}
      />
    </div>
  );
}

/**
 * The colour each slice of a rose is drawn in, by place rather than by figure:
 * the biggest share takes the house pink and the rest follow the palette down
 * the order, so the leading channel is the one the eye goes to and no two
 * neighbours are told apart by a shade nobody can name.
 *
 * Ties break on the label, so the chart and the key agree on which is which
 * whichever way each of them sorted its rows.
 */
export function roseColors(slices: Slice[]) {
  const rank = new Map(
    [...slices]
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .map((s, i) => [s, i] as const),
  );
  return slices.map((s) => seriesColor(rank.get(s) ?? 0));
}

/**
 * A split where the size of a slice is worth reading twice: once around, as a
 * share of the whole, and once outward, as a length against its neighbours.
 *
 * It's the rose pie from ECharts' own "Customized Pie" — every slice cut to its
 * share of the circle but drawn to a radius set by that share, so the largest
 * reaches furthest out.
 *
 * Sorted smallest first, which is what makes the spiral read as a ranking. The
 * slices go unlabelled and the key goes underneath, the same key the ring in
 * the equity split gets — names have room to be read there rather than trailing
 * off a leader line.
 */
export function RosePie({
  slices,
  height = 368,
}: {
  slices: Slice[];
  height?: number;
}) {
  const [chart, setChart] = useState<ECharts | null>(null);
  const [active, setActive] = useState<number | null>(null);

  // Drawn smallest first for the spiral, listed as it was given, which is the
  // ranking the caller meant. The key holds the place of each row in the chart
  // so hovering one can light the other.
  const sorted = useMemo(
    () => [...slices].sort((a, b) => a.value - b.value),
    [slices],
  );
  const colors = useMemo(() => roseColors(sorted), [sorted]);
  const places = useMemo(
    () => slices.map((s) => sorted.indexOf(s)),
    [slices, sorted],
  );

  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      animationEasing: "elasticOut",
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as {
            name: string;
            value: number;
            data: { sub?: string };
          };
          const sub = p.data.sub
            ? `<br/><span style="opacity:.6">${p.data.sub}</span>`
            : "";
          return `${p.name} &nbsp;<b>${p.value}%</b>${sub}`;
        },
      },
      series: [
        {
          type: "pie",
          // Solid to the centre and edge to edge: the hole and the hairline
          // between slices were what flattened this into a dial. Left alone,
          // the wedges of different reach sit over one shadow and read as
          // layers, which is the whole point of the shape.
          radius: "82%",
          center: ["50%", "50%"],
          roseType: "radius",
          data: sorted.map((s, i) => ({
            name: s.label,
            value: s.value,
            sub: s.sub,
            itemStyle: { color: colors[i] },
          })),
          label: { show: false },
          labelLine: { show: false },
          // The example this is taken from blurs its shadow 200px, which suits
          // the slate it sits on; on our black it spreads into a grey box round
          // the drawing rather than reading as depth, so it's kept tight.
          itemStyle: { shadowBlur: 24, shadowColor: "rgba(0,0,0,0.55)" },
          emphasis: {
            itemStyle: { shadowBlur: 40, shadowColor: "rgba(255,51,102,0.35)" },
          },
          animationType: "scale",
          animationEasing: "elasticOut",
          animationDelay: () => Math.random() * 200,
        },
      ],
    }),
    [sorted, colors],
  );

  const onReady = useCallback((instance: ECharts) => {
    setChart(instance);
    instance.on("globalout", () => setActive(null));
  }, []);

  useEffect(() => {
    if (!chart) return;
    if (active == null) {
      chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    } else {
      chart.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: places[active],
      });
    }
  }, [chart, active, places]);

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="w-full max-w-[368px]">
        <EChart option={option} height={height} onReady={onReady} />
      </div>

      <ChartLegend
        entries={slices.map((s) => ({
          label: s.label,
          color: colors[sorted.indexOf(s)],
          value: `${s.value}%`,
          sub: s.sub,
        }))}
        active={active}
        onActive={setActive}
      />
    </div>
  );
}

export type MarketTier = {
  /** What the tier is called — "Total available market". */
  tier: string | null;
  /** The amount as it reads — "USD 1.3 billion". */
  display: string;
  /** The same amount as one number, or 0 where there is no figure. */
  value: number;
};

/** The square the rings are drawn in, in both SVG units and CSS pixels. */
const RING_BOX = 300;

/**
 * The market as rings, each sitting inside the one above it: the whole market,
 * then the part that can be served, then the part that can realistically be
 * reached. Nesting is the point — a reachable market is only meaningful as a
 * portion of a total, and rings say that where three separate bars don't.
 *
 * Drawn by hand rather than through ECharts. There's no series here, only three
 * or four circles and their labels, and hand-drawn SVG keeps the type crisp and
 * the geometry exact; the interaction it would have brought — hover to find out
 * what something is — is instead always on screen.
 */
export function MarketRings({ tiers }: { tiers: MarketTier[] }) {
  const [active, setActive] = useState<number | null>(null);

  // Largest first, whatever order they were entered in: a tier only means
  // anything against the one it sits inside.
  const ordered = useMemo(
    () =>
      tiers
        .map((tier, i) => ({ ...tier, key: `${i}-${tier.tier ?? tier.display}` }))
        .sort((a, b) => b.value - a.value),
    [tiers],
  );

  const drawable = ordered.filter((t) => t.value > 0);
  const undrawable = ordered.filter((t) => t.value <= 0);
  const largest = drawable[0]?.value ?? 0;
  const maxRadius = (RING_BOX - 12) / 2;
  const baseY = RING_BOX - 6;

  const rings = drawable.map((tier, i) => {
    // Area follows the amount rather than radius: a circle twice as wide reads
    // as four times as much, which is how two of them get compared. The floor
    // keeps a tier orders of magnitude below the total from vanishing entirely —
    // 800K inside 2B is a quarter of a percent, and a circle that small is a dot
    // nobody can point at.
    const radius = Math.max(
      maxRadius * Math.sqrt(tier.value / largest),
      maxRadius * 0.17,
    );
    return {
      ...tier,
      index: i,
      radius,
      centerY: baseY - radius,
      top: baseY - radius * 2,
      // One hue throughout, deepening inwards, so the rings read as one market
      // narrowing rather than four unrelated figures.
      opacity: 0.06 + (i / Math.max(drawable.length - 1, 1)) * 0.1,
    };
  });

  return (
    <div className="space-y-10">
      {rings.length > 0 && (
        <div
          className="relative mx-auto"
          style={{ width: RING_BOX, height: RING_BOX }}
        >
          <svg
            viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
            width={RING_BOX}
            height={RING_BOX}
            className="block"
            role="presentation"
          >
            {rings.map((ring) => {
              const on = active === ring.index;
              return (
                <circle
                  key={ring.key}
                  cx={RING_BOX / 2}
                  cy={ring.centerY}
                  r={ring.radius}
                  fill={SERIES[0]}
                  fillOpacity={on ? ring.opacity + 0.12 : ring.opacity}
                  stroke={SERIES[0]}
                  strokeOpacity={on ? 1 : 0.45}
                  strokeWidth={on ? 2 : 1.25}
                  onMouseEnter={() => setActive(ring.index)}
                  onMouseLeave={() => setActive(null)}
                  className="transition-all duration-200 cursor-default"
                />
              );
            })}
          </svg>

          {/*
            Labels as HTML over the drawing rather than SVG text, so they hold
            the same sizes as the rest of the page instead of scaling with the
            geometry. Each sits just inside the top of its own ring, which is
            what stacks them down the middle in size order.
          */}
          {rings.map((ring) => (
            <div
              key={ring.key}
              className={cn(
                "absolute -translate-x-1/2 text-center pointer-events-none transition-opacity duration-200",
                active != null && active !== ring.index && "opacity-45",
              )}
              style={{
                left: "50%",
                top: ring.top + 12,
                width: Math.max(ring.radius * 1.7, 140),
              }}
            >
              {ring.tier && (
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
                  {ring.tier}
                </p>
              )}
              <p
                className="text-[17px] font-semibold tabular-nums leading-tight"
                style={{ color: SERIES[0] }}
              >
                {ring.display}
              </p>
            </div>
          ))}
        </div>
      )}

      {/*
        Every ring names itself in the middle of the drawing, so there's no key
        under it to repeat them. The one thing the drawing can't say is that a
        tier was left out of it, which is what this line is for.
      */}
      {undrawable.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Not drawn, no amount against them:{" "}
          {undrawable.map((t) => t.tier || "a tier").join(", ")}.
        </p>
      )}
    </div>
  );
}

/** A dot as ECharts holds it, with the flag the label and size read off. */
type QuadrantPoint = { name: string; value: [number, number]; isUs: boolean };

export function QuadrantChart({
  points,
  xLow,
  xHigh,
  yLow,
  yHigh,
}: {
  points: { label: string; x: number; y: number; isUs: boolean }[];
  xLow: string;
  xHigh: string;
  yLow: string;
  yHigh: string;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 600,
      grid: { left: 56, right: 56, top: 24, bottom: 24 },
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as { data: { name: string } };
          return `<b>${p.data.name}</b>`;
        },
      },
      xAxis: {
        type: "value",
        min: -110,
        max: 110,
        ...BARE_AXIS,
        splitLine: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: "value",
        min: -110,
        max: 110,
        ...BARE_AXIS,
        splitLine: { show: false },
        axisLabel: { show: false },
      },
      graphic: (
        [
          { text: yHigh, left: "center", top: 2 },
          { text: yLow, left: "center", bottom: 2 },
          { text: xLow, left: 2, top: "middle" },
          { text: xHigh, right: 2, top: "middle" },
        ] as const
      ).map((label) => ({
        type: "text" as const,
        ...label,
        silent: true,
        style: {
          text: label.text.toUpperCase(),
          fill: TEXT,
          fontSize: 9,
          width: 52,
          overflow: "truncate" as const,
        },
      })),
      series: [
        {
          type: "scatter",
          symbolSize: (_value: unknown, params: { data?: unknown }) =>
            (params.data as QuadrantPoint | undefined)?.isUs ? 18 : 13,
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            lineStyle: { color: GRID_LINE, type: "dashed", width: 1 },
            label: { show: false },
            data: [{ xAxis: 0 }, { yAxis: 0 }],
          },
          label: {
            show: true,
            position: "top",
            distance: 8,
            fontSize: 10,
            // Only we are named on the chart itself; naming everyone would
            // crowd the corners, and the rest answer on hover.
            formatter: (params) => {
              const point = params.data as QuadrantPoint;
              return point.isUs ? point.name : "";
            },
            color: SERIES[0],
            fontWeight: "bold",
          },
          emphasis: {
            label: {
              show: true,
              formatter: (params) => (params.data as QuadrantPoint).name,
              color: FOREGROUND,
            },
            scale: 1.3,
          },
          data: points.map((p) => ({
            name: p.label,
            value: [p.x, p.y],
            isUs: p.isUs,
            itemStyle: {
              color: p.isUs ? SERIES[0] : "rgba(255,255,255,0.35)",
              borderColor: p.isUs ? SERIES[0] : "transparent",
              borderWidth: p.isUs ? 6 : 0,
              opacity: p.isUs ? 1 : 0.8,
            },
          })),
        },
      ],
    }),
    [points, xHigh, xLow, yHigh, yLow],
  );

  return <EChart option={option} height={300} />;
}

/**
 * A stake over time. Dates are spaced evenly rather than by their real gaps —
 * these are a handful of decisions, not a time series, and the shape of the
 * dilution is the point.
 */
export function TrendChart({
  points,
  height = 340,
  format = (v) => `${v}%`,
  axisFormat,
}: {
  points: { label: string; value: number; caption?: string }[];
  height?: number;
  /** How a value reads in the tooltip — percentages unless told otherwise. */
  format?: (value: number) => string;
  /** Shorter again for the axis ticks, where a full figure won't fit. */
  axisFormat?: (value: number) => string;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: GRID_LINE } },
        formatter: (params) => {
          const [p] = params as { dataIndex: number; value: number }[];
          const point = points[p.dataIndex];
          const caption = point.caption
            ? `<br/><span style="color:${TEXT}">${point.caption}</span>`
            : "";
          return `<b>${format(point.value)}</b> · ${point.label}${caption}`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => p.label),
        ...BARE_AXIS,
        splitLine: { show: false },
        axisLabel: AXIS_LABEL,
      },
      yAxis: {
        type: "value",
        ...BARE_AXIS,
        axisLabel: {
          ...AXIS_LABEL,
          formatter: (value: number) => (axisFormat ?? format)(value),
        },
      },
      series: [
        {
          type: "line",
          smooth: 0.3,
          symbol: "circle",
          symbolSize: 7,
          showSymbol: points.length < 30,
          lineStyle: { width: 2, color: SERIES[0] },
          itemStyle: { color: SERIES[0], borderColor: CARD, borderWidth: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(255,51,102,0.35)" },
                { offset: 1, color: "rgba(255,51,102,0)" },
              ],
            },
          },
          data: points.map((p) => p.value),
        },
      ],
    }),
    [points, format, axisFormat],
  );

  return <EChart option={option} height={height} />;
}

/**
 * One or more figures across the periods they were reported for, drawn as
 * filled areas with a point on every reading.
 *
 * The fill is what makes two figures comparable at a glance — the gap between
 * revenue and cost is an area rather than a distance to measure — and the
 * points say which readings are real, since the line between them is drawn for
 * the eye rather than claiming anything about the months in between.
 *
 * The legend underneath names each series in its own colour, and clicking one
 * takes it off the chart, so a figure that dwarfs the rest can be set aside.
 */
export function SeriesArea({
  labels,
  series,
  format,
  axisFormat,
  height = 220,
}: {
  /** The periods, oldest first, shared by every series. */
  labels: string[];
  series: {
    name: string;
    color: string;
    values: (number | null)[];
    /** How this one reads, where it isn't in the same unit as the rest. */
    format?: (value: number) => string;
  }[];
  /** The fallback, and what the axis is written in. */
  format: (value: number) => string;
  /** Shorter again for the axis ticks, where a full figure won't fit. */
  axisFormat?: (value: number) => string;
  height?: number;
}) {
  // Where each series sits in the stack of fills: the biggest figure at the
  // back, the smallest in front. Drawn the other way round, a large band would
  // paint over the small ones and take every hover with it.
  const depth = useMemo(() => stackingOrder(series), [series]);
  const [hidden, setHidden] = useState<string[]>([]);

  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      grid: { left: 8, right: 14, top: 20, bottom: 4, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        // The figure under the cursor, not the whole chart: six figures at one
        // period is a table, and a table is what the Data view is for.
        trigger: "item",
        formatter: (params) => {
          const row = params as unknown as {
            dataIndex: number;
            seriesName: string;
            value: number | null;
            marker: string;
          };
          const own = series.find((s) => s.name === row.seriesName);
          const write = own?.format ?? format;
          const period = labels[row.dataIndex] ?? "";
          return `${row.marker} ${row.seriesName} &nbsp;<b>${
            row.value == null ? "—" : write(row.value)
          }</b><br/><span style="color:${TEXT}">${period}</span>`;
        },
      },
      // Kept but never drawn: the key under the chart is ours, and this is what
      // it switches a series off through.
      legend: {
        show: false,
        data: series.map((s) => s.name),
        selected: Object.fromEntries(
          series.map((s) => [s.name, !hidden.includes(s.name)]),
        ),
      },
      xAxis: {
        type: "category",
        // No padding at the ends, so the fill runs to the edge of the plot the
        // way it does on a printed chart.
        boundaryGap: false,
        data: labels,
        ...BARE_AXIS,
        splitLine: { show: false },
        axisLabel: AXIS_LABEL,
      },
      yAxis: {
        type: "value",
        ...BARE_AXIS,
        axisLabel: {
          ...AXIS_LABEL,
          formatter: (value: number) => (axisFormat ?? format)(value),
        },
      },
      series: series.map((s, i) => ({
        type: "line" as const,
        name: s.name,
        // Straight between readings: a curve through two quarterly figures
        // would invent a shape nobody reported.
        smooth: false,
        symbol: "circle" as const,
        symbolSize: 7,
        showSymbol: labels.length < 40,
        lineStyle: { width: 2, color: s.color },
        itemStyle: { color: s.color, borderColor: CARD, borderWidth: 2 },
        areaStyle: { color: s.color, opacity: 0.22 },
        // The band, not just its top edge: by default a line series only
        // answers on the line and its points, so a pointer anywhere in the fill
        // would get nothing.
        triggerEvent: true,
        // Smallest band on top, so a figure sitting inside a larger one is
        // still the thing under the cursor rather than being covered by it.
        z: 2 + depth[i],
        emphasis: { focus: "series" as const },
        connectNulls: false,
        data: s.values,
      })),
    }),
    [labels, series, format, axisFormat, depth, hidden],
  );

  return (
    <div className="flex flex-col gap-5">
      <EChart option={option} height={height} />
      <ChartLegend
        entries={series.map((s) => ({
          label: s.name,
          color: s.color,
          off: hidden.includes(s.name),
        }))}
        onToggle={(i) => {
          const name = series[i].name;
          setHidden((off) =>
            off.includes(name) ? off.filter((n) => n !== name) : [...off, name],
          );
        }}
      />
    </div>
  );
}

/**
 * The painting order for a set of areas, given as a depth per series: 0 for the
 * one drawn first and furthest back. Widest range first, so every band ends up
 * with some of itself exposed to the pointer.
 */
function stackingOrder(series: { values: (number | null)[] }[]): number[] {
  const reach = series.map((s) =>
    s.values.reduce<number>(
      (most, v) => (v == null ? most : Math.max(most, Math.abs(v))),
      0,
    ),
  );
  const back = series.map((_, i) => i).sort((a, b) => reach[b] - reach[a]);
  const depth = series.map(() => 0);
  back.forEach((index, place) => {
    depth[index] = place;
  });
  return depth;
}

/**
 * One metric's readings over time, small enough to sit in a card. Axes are left
 * off — the card says what the latest value is, and the line is there for the
 * shape of it, with the exact figures on hover.
 */
export function MetricSpark({
  points,
  color = SERIES[1],
  format,
  height = 92,
}: {
  points: { label: string; value: number }[];
  color?: string;
  format: (value: number) => string;
  height?: number;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      grid: { left: 2, right: 2, top: 8, bottom: 2 },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: GRID_LINE } },
        formatter: (params) => {
          const [p] = params as { dataIndex: number; value: number }[];
          return `<b>${format(p.value)}</b><br/><span style="color:${TEXT}">${
            points[p.dataIndex].label
          }</span>`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        show: false,
        data: points.map((p) => p.label),
      },
      yAxis: { type: "value", show: false, scale: true },
      series: [
        {
          type: "line",
          smooth: 0.35,
          symbol: "circle",
          symbolSize: 6,
          showSymbol: points.length < 20,
          lineStyle: { width: 2, color },
          itemStyle: { color, borderColor: CARD, borderWidth: 2 },
          areaStyle: {
            opacity: 0.18,
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color },
                { offset: 1, color: "rgba(0,0,0,0)" },
              ],
            },
          },
          data: points.map((p) => p.value),
        },
      ],
    }),
    [points, color, format],
  );

  return <EChart option={option} height={height} />;
}
