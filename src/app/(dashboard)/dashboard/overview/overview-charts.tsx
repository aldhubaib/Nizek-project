"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/echart";
import {
  STAGE_GROUP_LABELS,
  STAGE_GROUP_ORDER,
  type DeliveryStatus,
  type StageGroup,
} from "@/lib/project-attention";
import { cn } from "@/lib/utils";

/**
 * The drawing for the delivery dashboard.
 *
 * Only the two charts with an axis worth reading are ECharts. The stage columns
 * and the burndown sparklines are plain markup: there is one sparkline per
 * sprint row, and a canvas apiece would cost more than the lines are worth.
 */

/* ── palette ── */

export const STAGE_COLOR: Record<StageGroup, string> = {
  todo: "#858688",
  in_development: "#3b8cff",
  internal_review: "#eeae11",
  done: "#44c066",
};

export const DELIVERY_COLOR: Record<DeliveryStatus, string> = {
  on_track: "#44c066",
  at_risk: "#eeae11",
  off_track: "#f03a3e",
};

const TEXT = "hsl(0 0% 54%)";
const FOREGROUND = "hsl(0 0% 93%)";
const GRID_LINE = "hsl(0 0% 100% / 0.06)";

const TOOLTIP = {
  backgroundColor: "rgba(12,12,14,0.96)",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: 1,
  padding: [7, 10] as [number, number],
  textStyle: { color: FOREGROUND, fontSize: 12 },
  extraCssText:
    "border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);backdrop-filter:blur(6px);",
} as const;

/* ── progress bar ── */

/**
 * A sprint's completion, as a share of everything in it.
 *
 * Coloured by how the sprint is actually doing rather than by how full the bar
 * is: a bar at 40% is fine in week one and an emergency in the last two days,
 * and only the caller knows which.
 */
export function ProgressBar({
  value,
  tone,
  className,
}: {
  /** 0 to 1. */
  value: number;
  tone: DeliveryStatus;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`,
          background: DELIVERY_COLOR[tone],
        }}
      />
    </div>
  );
}

/* ── burndown sparkline ── */

/**
 * Open tasks over the life of a sprint, drawn small.
 *
 * The shape is the message: falling means work is landing, flat means it has
 * stopped. No axes, because at this size a number would be unreadable and the
 * row already spells the counts out in words.
 */
export function Sparkline({
  points,
  tone,
  width = 96,
  height = 28,
}: {
  points: number[];
  tone: DeliveryStatus;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const max = Math.max(...points, 1);
  const stepX = width / (points.length - 1);
  const path = points
    .map((value, i) => {
      const x = i * stepX;
      // Inset by a pixel top and bottom so a flat line at either extreme is
      // not clipped in half by the viewBox edge.
      const y = 1 + (1 - value / max) * (height - 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      <path
        d={path}
        stroke={DELIVERY_COLOR[tone]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── stage distribution ── */

export interface StageColumn {
  projectId: string;
  projectName: string;
  total: number;
  stages: Record<StageGroup, number>;
}

/**
 * One column per project, each normalised to full height.
 *
 * Normalising is the point: it puts a small project's shape beside a large
 * one's so a column that is mostly grey stands out as un-started work whether
 * it holds nine tasks or ninety. The raw total sits under each column for the
 * size that the shape deliberately hides.
 */
export function StageBars({
  columns,
  onPick,
}: {
  columns: StageColumn[];
  onPick?: (projectId: string) => void;
}) {
  if (columns.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        No tasks in any project yet
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-1">
        {columns.map((column) => (
          <button
            key={column.projectId}
            type="button"
            onClick={() => onPick?.(column.projectId)}
            className={cn(
              "group flex min-w-[72px] flex-1 flex-col items-center gap-2.5 rounded-xl p-1 transition-colors",
              onPick && "hover:bg-accent/40",
            )}
          >
            <span className="flex h-32 w-full flex-col overflow-hidden rounded-lg">
              {STAGE_GROUP_ORDER.map((group) => {
                const count = column.stages[group];
                if (count === 0) return null;
                return (
                  <span
                    key={group}
                    title={`${STAGE_GROUP_LABELS[group]} · ${count}`}
                    style={{
                      height: `${(count / column.total) * 100}%`,
                      background: STAGE_COLOR[group],
                    }}
                  />
                );
              })}
            </span>

            <span className="flex flex-col items-center gap-0.5">
              <span className="text-s font-semibold text-foreground tabular-nums">
                {column.total}
              </span>
              <span className="line-clamp-2 text-center text-xs leading-tight text-muted-foreground">
                {column.projectName}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-3">
        {STAGE_GROUP_ORDER.map((group) => (
          <span key={group} className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: STAGE_COLOR[group] }}
            />
            <span className="text-xs text-muted-foreground">
              {STAGE_GROUP_LABELS[group]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── throughput ── */

export interface ThroughputBar {
  label: string;
  count: number;
}

/** Tasks finished per week. The trend matters more than any single bar. */
export function ThroughputChart({
  bars,
  height = 150,
}: {
  bars: ThroughputBar[];
  height?: number;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      grid: { left: 4, right: 4, top: 12, bottom: 0, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as { dataIndex: number; value: number };
          const noun = p.value === 1 ? "task" : "tasks";
          return `Week of ${bars[p.dataIndex].label}<br/><b>${p.value}</b> ${noun} finished`;
        },
      },
      xAxis: {
        type: "category",
        data: bars.map((b) => b.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: TEXT, fontSize: 9, interval: 1 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: TEXT, fontSize: 9 },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: STAGE_COLOR.done },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.5)" },
          },
          data: bars.map((b) => b.count),
        },
      ],
    }),
    [bars],
  );

  return <EChart option={option} height={height} />;
}

/* ── commitment reliability ── */

export interface ReliabilityBar {
  label: string;
  projectName: string;
  /** 0 to 1. */
  reliability: number;
  committed: number;
  committedDone: number;
}

export function ReliabilityChart({
  bars,
  height = 170,
}: {
  bars: ReliabilityBar[];
  height?: number;
}) {
  // Whichever of the two names actually tells the bars apart. With every sprint
  // from one project the project name repeats down the axis and says nothing;
  // across projects it is the sprint numbers that collide instead.
  const axisLabels = useMemo(() => {
    const projects = new Set(bars.map((b) => b.projectName));
    return bars.map((b) => (projects.size > 1 ? b.projectName : b.label));
  }, [bars]);

  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 700,
      grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as { dataIndex: number; value: number };
          const bar = bars[p.dataIndex];
          return `<b>${bar.projectName}</b> · ${bar.label}<br/>${bar.committedDone} of ${bar.committed} committed tasks shipped &nbsp;<b>${p.value}%</b>`;
        },
      },
      xAxis: {
        type: "category",
        data: axisLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: TEXT,
          fontSize: 10,
          interval: 0,
          overflow: "truncate",
          width: 64,
        },
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: TEXT, fontSize: 10, formatter: "{value}%" },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 34,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            // Green when the promise was kept, amber when it slipped, red when
            // it broke. Same thresholds the summary figure is coloured by.
            color: (params: { dataIndex: number }) => {
              const value = bars[params.dataIndex].reliability;
              if (value >= 0.9) return DELIVERY_COLOR.on_track;
              if (value >= 0.7) return DELIVERY_COLOR.at_risk;
              return DELIVERY_COLOR.off_track;
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 14, shadowColor: "rgba(0,0,0,0.5)" },
          },
          data: bars.map((b) => Math.round(b.reliability * 100)),
        },
      ],
    }),
    [bars, axisLabels],
  );

  return <EChart option={option} height={height} />;
}
