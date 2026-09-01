"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpDown, BellOff, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader, PageName } from "@/components/page-header";
import { outlineBadge } from "@/lib/task-label";
import {
  SNOOZE_OPTIONS,
  compareProjects,
  groupSignalsByTier,
  type AttentionTier,
} from "@/lib/project-attention";
import {
  clearOverviewSnoozes,
  snoozeOverviewSignal,
  type ManagerOverview,
  type OverviewProject,
  type OverviewTrends,
} from "@/actions/overview";
import { cn } from "@/lib/utils";

interface Props {
  overview: ManagerOverview;
}

/* ── helpers ── */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Relative time against the server's render clock rather than the browser's, so
 * the first paint matches the markup that arrived.
 */
function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const diff = nowMs - new Date(iso).getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

function stateBadge(project: OverviewProject) {
  const sprint = project.sprint;

  if (!sprint) {
    return {
      config: outlineBadge("No sprint", "text-violet", "border-violet/30"),
      detail: project.unstartedSprint ? "queued, not started" : null,
    };
  }

  const { state, remaining, daysRemaining } = sprint;

  if (state === "overdue") {
    const over = Math.abs(daysRemaining);
    return {
      config: outlineBadge(
        `${over}d overdue`,
        "text-destructive",
        "border-destructive/30",
      ),
      detail: `${remaining} left`,
    };
  }

  if (state === "at_risk") {
    return {
      config: outlineBadge("At risk", "text-orange", "border-orange/30"),
      detail: `${remaining} left, ${Math.max(0, daysRemaining)}d to go`,
    };
  }

  return {
    config: outlineBadge("On track", "text-success", "border-success/30"),
    detail:
      remaining === 0
        ? "all done"
        : `${remaining} left, ${Math.max(0, daysRemaining)}d to go`,
  };
}

type SortKey = "attention" | "name" | "deadline" | "activity";

const SORT_LABELS: Record<SortKey, string> = {
  attention: "Needs attention",
  name: "Name",
  deadline: "Sprint end",
  activity: "Last activity",
};

function sortProjects(projects: OverviewProject[], key: SortKey): OverviewProject[] {
  const rows = [...projects];
  switch (key) {
    case "name":
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    case "deadline":
      // Projects with no sprint have no deadline to sort by, so they sink.
      return rows.sort((a, b) => {
        const ea = a.sprint ? new Date(a.sprint.endDate).getTime() : Infinity;
        const eb = b.sprint ? new Date(b.sprint.endDate).getTime() : Infinity;
        return ea - eb;
      });
    case "activity":
      return rows.sort((a, b) => {
        const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return ta - tb;
      });
    default:
      return rows.sort(compareProjects);
  }
}

/* ── attention feed ── */

/**
 * Dot colour per tier. The groups are labelled, so this only has to make the
 * boundaries visible while scanning.
 */
const TIER_DOT: Record<AttentionTier, string> = {
  recoverable: "bg-orange",
  unwatched: "bg-violet",
  blocked: "bg-cyan",
  missed: "bg-destructive",
  chronic: "bg-muted-foreground",
};

function AttentionFeed({
  projects,
  snoozedCount,
}: {
  projects: OverviewProject[];
  snoozedCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const groups = useMemo(() => groupSignalsByTier(projects), [projects]);

  const snooze = (projectId: string, signalType: string, days: number) => {
    startTransition(async () => {
      await snoozeOverviewSignal(projectId, signalType, days);
      router.refresh();
    });
  };

  const restore = () => {
    startTransition(async () => {
      await clearOverviewSnoozes();
      router.refresh();
    });
  };

  const snoozeNote = snoozedCount > 0 && (
    <button
      type="button"
      onClick={restore}
      disabled={isPending}
      className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
    >
      {snoozedCount} snoozed — bring back
    </button>
  );

  if (groups.length === 0) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card px-5 py-4">
        <ShieldCheck className="size-4 shrink-0 text-success" />
        <p className="text-s text-foreground">
          Nothing needs attention right now.
        </p>
        {snoozeNote}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mb-5 rounded-2xl border border-border/60 bg-card p-5 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-s font-semibold text-foreground">Needs attention</h2>
        {snoozeNote}
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.tier}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
              {group.label}
            </p>
            <div className="flex flex-col">
              {group.items.map(({ project, signal }) => (
                <div
                  key={`${project.id}-${signal.type}`}
                  className="group/row flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      TIER_DOT[group.tier],
                    )}
                  />
                  <Link
                    href={`/dashboard/projects/${project.id}${project.sprint ? "?tab=sprints" : ""}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <span className="shrink-0 text-xs font-medium text-foreground">
                      {project.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {signal.message}
                    </span>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={isPending}
                      title="Snooze this"
                      aria-label={`Snooze ${signal.message}`}
                      className="shrink-0 rounded-md p-1 text-muted-foreground/40 opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 disabled:opacity-30"
                    >
                      <BellOff className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      {SNOOZE_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.days}
                          onClick={() =>
                            snooze(project.id, signal.type, option.days)
                          }
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── row ── */

function ProjectRow({
  project,
  nowMs,
}: {
  project: OverviewProject;
  nowMs: number;
}) {
  const worst = project.signals[0] ?? null;
  const badge = stateBadge(project);
  const sprint = project.sprint;
  const total = sprint ? sprint.committed + sprint.added : 0;

  return (
    <Link
      href={`/dashboard/projects/${project.id}${sprint ? "?tab=sprints" : ""}`}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-accent/60",
        "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto]",
        !worst && "opacity-55 hover:opacity-100",
      )}
    >
      {/* project */}
      <div className="flex min-w-0 items-center gap-3">
        {project.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.logoUrl}
            alt=""
            className="size-7 shrink-0 rounded-md object-cover"
          />
        ) : (
          <Avatar size="sm">
            <AvatarFallback>
              {project.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <p className="truncate text-s font-medium text-foreground">
            {project.name}
          </p>
          <p
            className={cn(
              "truncate text-xs",
              worst ? "text-muted-foreground" : "text-muted-foreground/60",
            )}
          >
            {worst ? worst.message : (project.teamName ?? "Healthy")}
          </p>
        </div>
      </div>

      {/* sprint + counts */}
      <div className="hidden min-w-0 md:block">
        {sprint ? (
          <>
            <p className="truncate text-xs font-medium text-foreground">
              {sprint.name}
            </p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {sprint.done} of {total} done
              {sprint.added > 0 && ` · ${sprint.added} added mid-sprint`}
            </p>
          </>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {project.unstartedSprint
              ? `${project.unstartedSprint.name} queued`
              : "Nothing planned"}
          </p>
        )}
      </div>

      {/* verdict */}
      <div className="hidden min-w-0 md:block">
        <StatusBadge size="xs" config={badge.config} />
        {badge.detail && (
          <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            {badge.detail}
          </p>
        )}
      </div>

      {/* last activity */}
      <div className="hidden shrink-0 text-right md:block">
        <p className="text-xs text-muted-foreground tabular-nums">
          {relativeTime(project.lastActivityAt, nowMs)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="md:hidden">
          <StatusBadge size="xs" config={badge.config} />
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/30" />
      </div>
    </Link>
  );
}

/* ── trend strip ── */

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function reliabilityColor(value: number): string {
  if (value >= 0.9) return "text-success";
  if (value >= 0.7) return "text-orange";
  return "text-destructive";
}

function TrendStrip({ trends }: { trends: OverviewTrends }) {
  if (trends.sprints.length === 0) return null;

  const totalAdded = trends.sprints.reduce((sum, s) => sum + s.added, 0);
  const totalCommitted = trends.sprints.reduce((sum, s) => sum + s.committed, 0);
  const creep = totalCommitted + totalAdded > 0
    ? totalAdded / (totalCommitted + totalAdded)
    : 0;

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-s font-semibold text-foreground">
            Commitment reliability
          </h2>
          {trends.overallReliability !== null && (
            <span
              className={cn(
                "text-s font-semibold tabular-nums",
                reliabilityColor(trends.overallReliability),
              )}
            >
              {pct(trends.overallReliability)} over{" "}
              {trends.sprints.length} sprints
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          {trends.sprints.map((sprint) => (
            <div key={sprint.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex h-20 items-end rounded-md bg-accent/40">
                <div
                  className={cn(
                    "w-full rounded-md transition-all",
                    sprint.reliability >= 0.9
                      ? "bg-success/70"
                      : sprint.reliability >= 0.7
                        ? "bg-orange/70"
                        : "bg-destructive/70",
                  )}
                  style={{
                    height: `${Math.max(4, sprint.reliability * 100)}%`,
                  }}
                  title={`${sprint.projectName} — ${sprint.name}: ${sprint.committedDone} of ${sprint.committed} committed tasks delivered`}
                />
              </div>
              <p className="truncate text-center text-xs text-muted-foreground tabular-nums">
                {pct(sprint.reliability)}
              </p>
              <p className="truncate text-center text-xs text-muted-foreground/60">
                {sprint.projectName}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Share of each sprint&apos;s committed tasks that shipped.{" "}
          {totalAdded > 0 && (
            <>
              {pct(creep)} of the work in these sprints was added after they
              started.
            </>
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="mb-4 text-s font-semibold text-foreground">
          Why work did not finish
        </h2>
        {trends.missedTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every task in the last {trends.sprints.length} sprints finished.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
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
      </div>
    </div>
  );
}

/* ── main ── */

export function OverviewClient({ overview }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const nowMs = new Date(overview.nowIso).getTime();

  const rows = useMemo(
    () => sortProjects(overview.projects, sortKey),
    [overview.projects, sortKey],
  );

  const needsAttention = overview.projects.length - overview.healthyCount;

  return (
    <div>
      <PageHeader>
        <PageName>Overview</PageName>
      </PageHeader>

      <div className="py-6">
        {overview.projects.length > 0 && (
          <AttentionFeed
            projects={overview.projects}
            snoozedCount={overview.snoozedCount}
          />
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-s font-semibold text-foreground">
              {needsAttention > 0
                ? `${needsAttention} of ${overview.projects.length} projects need attention`
                : `All ${overview.projects.length} projects look healthy`}
            </h2>
            <p className="text-xs text-muted-foreground">
              Live client projects, worst first.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1">
            <ArrowUpDown className="ml-1 size-3 shrink-0 text-muted-foreground" />
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  sortKey === key
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
            <ShieldCheck className="mx-auto mb-3 size-6 text-muted-foreground/50" />
            <p className="text-s font-medium text-foreground">
              No projects in scope
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This lists projects on a live contract only. Anything without one,
              or behind on payment, is left out.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-2">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] gap-3 px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground/70 md:grid">
              <span>Project</span>
              <span>Sprint</span>
              <span>Status</span>
              <span className="text-right">Activity</span>
              <span className="w-3.5" />
            </div>
            <div className="flex flex-col">
              {rows.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </div>
        )}

        <TrendStrip trends={overview.trends} />
      </div>
    </div>
  );
}
