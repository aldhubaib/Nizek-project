"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BellOff,
  CalendarClock,
  CheckCircle2,
  LayoutGrid,
  ListChecks,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { outlineBadge } from "@/lib/task-label";
import {
  DELIVERY_STATUS_LABELS,
  SNOOZE_OPTIONS,
  TIER_LABELS,
  compareSignals,
  type AttentionSignal,
  type AttentionTier,
  type DeliveryStatus,
} from "@/lib/project-attention";
import {
  clearOverviewSnoozes,
  snoozeOverviewSignal,
  type ManagerOverview,
  type OpenSprint,
  type OverviewTrends,
  type PortfolioRow,
} from "@/actions/overview";
import {
  ProgressBar,
  ReliabilityChart,
  Sparkline,
  StageBars,
  ThroughputChart,
} from "./overview-charts";
import { cn } from "@/lib/utils";

interface Props {
  overview: ManagerOverview;
}

/* ── formatting ── */

const MONTHS = [
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
];

/**
 * Dates are formatted from their UTC parts rather than with `toLocaleDateString`
 * so the server's markup and the browser's first render agree — the two run in
 * different time zones often enough to trip hydration otherwise.
 */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function dateRange(startIso: string, endIso: string): string {
  return `${shortDate(startIso)} – ${shortDate(endIso)}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* ── shared shells ── */

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Icon, title, one line of explanation, and the number the panel is about. */
function PanelHead({
  icon: Icon,
  title,
  subtitle,
  value,
}: {
  icon: typeof Activity;
  title: string;
  subtitle: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-s font-semibold text-foreground">
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {value !== undefined && (
        <span className="shrink-0 text-m font-bold text-foreground tabular-nums">
          {value}
        </span>
      )}
    </div>
  );
}

/** Bottom rule plus a count, for panels that show only their first few rows. */
function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-t border-border/50 pt-3 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

const UPPER = "text-xs font-medium uppercase tracking-wider";

/* ── KPI strip ── */

type Tone = "good" | "warn" | "bad" | "flat";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-success",
  warn: "text-orange",
  bad: "text-destructive",
  flat: "text-muted-foreground",
};

const TONE_BORDER: Record<Tone, string> = {
  good: "border-success/30",
  warn: "border-orange/30",
  bad: "border-destructive/30",
  flat: "border-border",
};

function KpiCard({
  label,
  value,
  chip,
  chipTone = "flat",
  caption,
}: {
  label: string;
  value: string;
  chip?: string;
  chipTone?: Tone;
  caption: string;
}) {
  return (
    <Card className="p-4">
      <p className={cn(UPPER, "text-muted-foreground/70")}>{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold leading-none text-foreground tabular-nums">
          {value}
        </span>
        {chip && (
          <span
            className={cn(
              "rounded-full border bg-background px-2 py-0.5 text-xs font-semibold tabular-nums",
              TONE_TEXT[chipTone],
              TONE_BORDER[chipTone],
            )}
          >
            {chip}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </Card>
  );
}

function KpiStrip({ overview }: { overview: ManagerOverview }) {
  const k = overview.kpis;
  const completion = k.sprintTotal > 0 ? k.sprintDone / k.sprintTotal : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Open tasks"
        value={String(k.openTasks)}
        chip={
          k.openDelta === 0
            ? "level this week"
            : `${k.openDelta > 0 ? "+" : ""}${k.openDelta} this week`
        }
        // The pile shrinking is the good direction, so a negative delta is green.
        chipTone={k.openDelta < 0 ? "good" : k.openDelta > 0 ? "warn" : "flat"}
        caption={`${k.doneTasks} finished of ${k.totalTasks} total`}
      />

      <KpiCard
        label="Sprint completion"
        value={pct(completion)}
        chip={`${k.sprintDone}/${k.sprintTotal} tasks`}
        chipTone={
          completion >= 0.8 ? "good" : completion >= 0.5 ? "warn" : "bad"
        }
        caption={
          k.openSprintCount === 0
            ? "No sprint is running"
            : `${plural(k.sprintRemaining, "task")} left in ${plural(k.openSprintCount, "running sprint")}`
        }
      />

      <KpiCard
        label="Avg. throughput"
        value={String(k.throughput)}
        chip={
          k.throughputDelta === null
            ? undefined
            : `${k.throughputDelta > 0 ? "+" : ""}${pct(k.throughputDelta)}`
        }
        chipTone={
          k.throughputDelta === null
            ? "flat"
            : k.throughputDelta >= 0
              ? "good"
              : "bad"
        }
        caption="Tasks delivered per sprint, trailing 3"
      />

      <KpiCard
        label="Needs attention"
        value={String(overview.projects.length - overview.healthyCount)}
        chip={`${overview.projects.length} live`}
        chipTone={
          overview.projects.length === overview.healthyCount ? "good" : "bad"
        }
        caption={
          overview.healthyCount === overview.projects.length
            ? "Every project is on track"
            : `${overview.healthyCount} with nothing flagged`
        }
      />
    </div>
  );
}


/* ── sprints ── */

/**
 * How a sprint is doing, for colouring only.
 *
 * Compares work finished against time spent: a sprint 90% through its days with
 * half its tasks open is off track even though the calendar has not run out yet.
 */
function sprintTone(sprint: OpenSprint, nowMs: number): DeliveryStatus {
  if (sprint.remaining === 0) return "on_track";

  const start = new Date(sprint.startDate).getTime();
  const end = new Date(sprint.endDate).getTime();
  if (nowMs > end) return "off_track";
  if (nowMs <= start || end <= start) return "on_track";

  const donePct = sprint.total > 0 ? sprint.done / sprint.total : 1;
  const timePct = (nowMs - start) / (end - start);
  if (donePct + 0.2 < timePct) return "at_risk";
  return "on_track";
}

function SprintStatusTag({ status }: { status: string }) {
  return (
    <span className={cn(UPPER, "shrink-0 text-muted-foreground/60")}>
      {status === "ACTIVE"
        ? "Active"
        : status === "NEXT"
          ? "Next"
          : status === "PLANNED"
            ? "Planned"
            : status.toLowerCase()}
    </span>
  );
}

function ActiveSprintsPanel({
  sprints,
  nowMs,
}: {
  sprints: OpenSprint[];
  nowMs: number;
}) {
  const running = sprints.filter((s) => s.status === "ACTIVE");
  const shown = running.slice(0, 5);
  const done = running.reduce((sum, s) => sum + s.done, 0);
  const total = running.reduce((sum, s) => sum + s.total, 0);

  return (
    <Card>
      <PanelHead
        icon={CalendarClock}
        title="Active sprints"
        subtitle="tasks done and tasks remaining"
        value={total > 0 ? `${done}/${total}` : "—"}
      />

      {running.length === 0 ? (
        <div className="py-12 text-center">
          <CalendarClock className="mx-auto mb-2 size-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">
            No sprint is running right now
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((sprint) => {
            const tone = sprintTone(sprint, nowMs);
            return (
              <Link
                key={sprint.id}
                href={`/dashboard/projects/${sprint.projectId}?tab=sprints`}
                className="rounded-xl bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-s font-medium text-foreground">
                    {sprint.name}
                  </p>
                  <SprintStatusTag status={sprint.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {sprint.projectName} ·{" "}
                  {dateRange(sprint.startDate, sprint.endDate)}
                </p>

                <div className="mt-2 flex items-center gap-3">
                  <Sparkline points={sprint.burndown} tone={tone} />
                  <div className="min-w-0 flex-1">
                    <ProgressBar
                      value={sprint.total > 0 ? sprint.done / sprint.total : 0}
                      tone={tone}
                    />
                    <p className="mt-1.5 truncate text-xs text-muted-foreground tabular-nums">
                      {sprint.done} of {sprint.total} done ·{" "}
                      <span className="font-semibold text-foreground">
                        {sprint.remaining} left
                      </span>
                      {sprint.added > 0 && ` · ${sprint.added} added`}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}

          {running.length > shown.length && (
            <PanelFooter>
              {plural(running.length - shown.length, "more running sprint")}
            </PanelFooter>
          )}
        </div>
      )}
    </Card>
  );
}

function UnfinishedSprints({
  sprints,
  nowMs,
}: {
  sprints: OpenSprint[];
  nowMs: number;
}) {
  const open = sprints.filter((s) => s.remaining > 0);
  if (open.length === 0) return null;

  const left = open.reduce((sum, s) => sum + s.remaining, 0);

  return (
    <Card>
      <PanelHead
        icon={ListChecks}
        title="Sprints with unfinished tasks"
        subtitle="every open sprint and the work still left in it"
        value={`${left} left`}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {open.map((sprint) => {
          const tone = sprintTone(sprint, nowMs);
          const complete = sprint.total > 0 ? sprint.done / sprint.total : 0;
          return (
            <Link
              key={sprint.id}
              href={`/dashboard/projects/${sprint.projectId}?tab=sprints`}
              className="rounded-xl border border-border/50 bg-muted/30 p-3.5 transition-colors hover:border-border hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-s font-medium text-foreground">
                  {sprint.name}
                </p>
                <SprintStatusTag status={sprint.status} />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {sprint.projectName} ·{" "}
                {dateRange(sprint.startDate, sprint.endDate)}
              </p>

              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-xl font-bold leading-none text-foreground tabular-nums">
                  {sprint.remaining}
                </span>
                <span className="text-xs text-muted-foreground">
                  tasks remaining
                </span>
              </p>

              <ProgressBar value={complete} tone={tone} className="mt-3" />
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {sprint.done} of {sprint.total} done · {pct(complete)} complete
              </p>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/* ── portfolio ── */

function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card>
      <PanelHead
        icon={Activity}
        title="Portfolio health"
        subtitle="contract, throughput and delivery status"
      />

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div
            className={cn(
              "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto] gap-3 border-b border-border/50 pb-2",
              UPPER,
              "text-muted-foreground/60",
            )}
          >
            <span>Project</span>
            <span>Lead</span>
            <span>Contract</span>
            <span className="text-right">Throughput</span>
            <span className="text-right">Status</span>
          </div>

          {rows.map((row) => (
            <Link
              key={row.projectId}
              href={`/dashboard/projects/${row.projectId}`}
              className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto] items-center gap-3 rounded-lg py-2.5 transition-colors hover:bg-accent/40"
            >
              <span className="truncate text-s font-medium text-foreground">
                {row.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.leadName ?? "No lead"}
              </span>

              <span className="min-w-0">
                {row.contractElapsed === null ? (
                  <span className="text-xs text-muted-foreground/60">—</span>
                ) : (
                  <>
                    <ProgressBar
                      value={row.contractElapsed}
                      // Near the end of a contract with work still open is the
                      // thing to notice, so the bar reddens as the window closes.
                      tone={
                        row.contractElapsed >= 0.9
                          ? "off_track"
                          : row.contractElapsed >= 0.75
                            ? "at_risk"
                            : "on_track"
                      }
                    />
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      {pct(row.contractElapsed)} elapsed
                    </span>
                  </>
                )}
              </span>

              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {plural(row.throughput, "task")}
              </span>

              <span className="text-right">
                <StatusBadge
                  size="xs"
                  config={outlineBadge(
                    DELIVERY_STATUS_LABELS[row.status],
                    row.status === "on_track"
                      ? "text-success"
                      : row.status === "at_risk"
                        ? "text-orange"
                        : "text-destructive",
                    row.status === "on_track"
                      ? "border-success/30"
                      : row.status === "at_risk"
                        ? "border-orange/30"
                        : "border-destructive/30",
                  )}
                />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── risks ── */

interface RiskRow {
  projectId: string;
  projectName: string;
  signal: AttentionSignal;
}

function RisksPanel({
  risks,
  snoozedCount,
  onSnooze,
  onRestore,
  busy,
}: {
  risks: RiskRow[];
  snoozedCount: number;
  onSnooze: (projectId: string, signalType: string, days: number) => void;
  onRestore: () => void;
  busy: boolean;
}) {
  const shown = risks.slice(0, 6);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <PanelHead
          icon={AlertTriangle}
          title="Risks & blockers"
          subtitle="ranked by what it costs to ignore"
        />
        {snoozedCount > 0 && (
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
          >
            {snoozedCount} snoozed
          </button>
        )}
      </div>

      {risks.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-6 text-success/40" />
          <p className="text-xs text-muted-foreground">
            Nothing flagged anywhere
          </p>
        </div>
      ) : (
        <div className={cn("flex flex-col gap-2", busy && "opacity-60")}>
          {shown.map(({ projectId, projectName, signal }) => (
            <div
              key={`${projectId}:${signal.type}`}
              className="group/risk flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: TIER_COLOR[signal.tier] }}
                title={TIER_LABELS[signal.tier]}
              />
              <Link
                href={`/dashboard/projects/${projectId}`}
                className="min-w-0 flex-1 text-xs text-foreground hover:underline"
              >
                <span className="font-medium">{projectName}</span>
                <span className="text-muted-foreground"> — {signal.message}</span>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={busy}
                  title="Snooze this"
                  aria-label={`Snooze: ${signal.message}`}
                  className="shrink-0 rounded-md p-0.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/risk:opacity-100 disabled:opacity-30"
                >
                  <BellOff className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {SNOOZE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.days}
                      onClick={() =>
                        onSnooze(projectId, signal.type, option.days)
                      }
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {risks.length > shown.length && (
            <PanelFooter>
              {plural(risks.length - shown.length, "more risk")}
            </PanelFooter>
          )}
        </div>
      )}
    </Card>
  );
}

const TIER_COLOR: Record<AttentionTier, string> = {
  recoverable: "#eeae11",
  unwatched: "#a78bfa",
  blocked: "#3b8cff",
  missed: "#f03a3e",
  chronic: "#858688",
};

/* ── trends ── */

function reliabilityTone(value: number): string {
  if (value >= 0.9) return "text-success";
  if (value >= 0.7) return "text-orange";
  return "text-destructive";
}

function TrendRow({ trends }: { trends: OverviewTrends }) {
  if (trends.sprints.length === 0) return null;

  const projectNames = [...new Set(trends.sprints.map((s) => s.projectName))];
  const totalAdded = trends.sprints.reduce((sum, s) => sum + s.added, 0);
  const totalCommitted = trends.sprints.reduce((sum, s) => sum + s.committed, 0);
  const creep =
    totalCommitted + totalAdded > 0
      ? totalAdded / (totalCommitted + totalAdded)
      : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-s font-semibold text-foreground">
              Commitment reliability
            </h2>
            {/* These are the last sprints to close anywhere in scope, which is
                often all one project — the bars are labelled by sprint, so
                without this the panel never names what it is describing. */}
            <p className="truncate text-xs text-muted-foreground">
              {projectNames.length === 1
                ? projectNames[0]
                : `Across ${projectNames.length} projects`}
            </p>
          </div>
          {trends.overallReliability !== null && (
            <span
              className={cn(
                "shrink-0 text-s font-semibold tabular-nums",
                reliabilityTone(trends.overallReliability),
              )}
            >
              {pct(trends.overallReliability)} over {trends.sprints.length}{" "}
              sprints
            </span>
          )}
        </div>

        <ReliabilityChart
          bars={trends.sprints.map((s) => ({
            label: s.name,
            projectName: s.projectName,
            reliability: s.reliability,
            committed: s.committed,
            committedDone: s.committedDone,
          }))}
        />

        <p className="mt-2 text-xs text-muted-foreground">
          Share of each sprint&apos;s committed tasks that shipped.
          {totalAdded > 0 && (
            <> {pct(creep)} of the work was added after the sprint started.</>
          )}
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-s font-semibold text-foreground">
          Why work did not finish
        </h2>
        {trends.missedTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every task in the last {trends.sprints.length} sprints finished.
          </p>
        ) : (
          <div className="flex max-h-56 flex-col gap-3 overflow-y-auto">
            {trends.missedTasks.map((task, i) => (
              <div key={`${task.sprintName}-${task.title}-${i}`}>
                <p className="truncate text-xs font-medium text-foreground">
                  {task.title}
                </p>
                <p className="text-xs text-muted-foreground">{task.reason}</p>
                <p className="text-xs text-muted-foreground/50">
                  {task.projectName} · {task.sprintName}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── main ── */

/**
 * The portfolio half of the dashboard, shown under the personal half to anyone
 * who can audit.
 *
 * It renders as a section rather than a page: no header bar and no page
 * padding, because the dashboard it sits inside owns both. Everything personal
 * — the viewer's own tasks, their sprints, their deadlines — is deliberately
 * absent, since the half above already covers it.
 */
export function DeliverySection({ overview }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const nowMs = new Date(overview.nowIso).getTime();

  const risks = useMemo<RiskRow[]>(() => {
    const rows = overview.projects.flatMap((project) =>
      project.signals.map((signal) => ({
        projectId: project.id,
        projectName: project.name,
        signal,
      })),
    );
    return rows.sort((a, b) => compareSignals(a.signal, b.signal));
  }, [overview.projects]);

  const throughputBars = useMemo(
    () =>
      overview.throughputWeeks.map((week) => ({
        label: shortDate(week.weekStart),
        count: week.count,
      })),
    [overview.throughputWeeks],
  );

  const runningCount = overview.openSprints.filter(
    (s) => s.status === "ACTIVE",
  ).length;

  const mutate = (run: () => Promise<void>) => {
    setBusy(true);
    startTransition(async () => {
      await run();
      router.refresh();
      setBusy(false);
    });
  };

  // The filter only narrows the delivery half, but it travels as a URL param so
  // the whole page re-queries. `scroll: false` keeps the jump from throwing the
  // reader back to the top of the personal half they had scrolled past.
  const pickProject = (value: string | null) => {
    startTransition(() => {
      router.push(
        !value || value === "all"
          ? "/dashboard"
          : `/dashboard?project=${encodeURIComponent(value)}`,
        { scroll: false },
      );
    });
  };

  const working = busy || isPending;

  return (
    <section
      className={cn(
        "flex flex-col gap-4 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-6">
        <div className="min-w-0">
          <h2 className="text-m font-bold text-foreground">Delivery</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plural(overview.projects.length, "project")} ·{" "}
            {plural(runningCount, "sprint")} in flight · week of{" "}
            {shortDate(overview.nowIso)}
          </p>
        </div>

        {overview.projectOptions.length > 1 && (
          <Select
            value={overview.selectedProjectId ?? "all"}
            onValueChange={pickProject}
          >
            <SelectTrigger size="sm" className="w-[190px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All projects</SelectItem>
              {overview.projectOptions.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {overview.projects.length === 0 ? (
        <Card className="py-14 text-center">
          <LayoutGrid className="mx-auto mb-3 size-6 text-muted-foreground/40" />
          <p className="text-s font-medium text-foreground">
            No projects in scope
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            This lists projects on a live contract only. Anything without one,
            or behind on payment, is left out.
          </p>
        </Card>
      ) : (
        <>
          <KpiStrip overview={overview} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ActiveSprintsPanel sprints={overview.openSprints} nowMs={nowMs} />

            <RisksPanel
              risks={risks}
              snoozedCount={overview.snoozedCount}
              busy={working}
              onSnooze={(projectId, signalType, days) =>
                mutate(() => snoozeOverviewSignal(projectId, signalType, days))
              }
              onRestore={() => mutate(() => clearOverviewSnoozes())}
            />
          </div>

          <UnfinishedSprints sprints={overview.openSprints} nowMs={nowMs} />

          <Card>
            <PanelHead
              icon={LayoutGrid}
              title="Tasks by stage"
              subtitle="where each project's work is sitting"
            />
            <StageBars
              columns={overview.stageDistribution.map((p) => ({
                projectId: p.projectId,
                projectName: p.projectName,
                total: p.total,
                stages: p.stages,
              }))}
              onPick={(projectId) => pickProject(projectId)}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <PortfolioTable rows={overview.portfolio} />

            <Card>
              <PanelHead
                icon={Activity}
                title="Throughput"
                subtitle="tasks finished per week, 12 weeks"
              />
              <ThroughputChart bars={throughputBars} />
            </Card>
          </div>

          <TrendRow trends={overview.trends} />
        </>
      )}
    </section>
  );
}
