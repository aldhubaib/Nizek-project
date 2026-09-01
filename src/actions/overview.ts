"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuditAccess } from "@/actions/audit";
import { activeProjectFilter } from "@/lib/project-filters";
import { ACTIVE_STAGES, CLIENT_INPUT_WAIT_MS } from "@/lib/audit-flags";
import { getActiveContract } from "@/lib/contract-rules";
import {
  DAY_MS,
  MAX_SNOOZE_DAYS,
  compareProjects,
  deliveryStatus,
  emptyStageCounts,
  isDoneStage,
  projectSignals,
  sprintOutcome,
  sprintVerdict,
  stageGroup,
  type AttentionSignal,
  type DeliveryStatus,
  type SprintState,
  type StageGroup,
} from "@/lib/project-attention";

export interface OverviewSprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Tasks the sprint started with. */
  committed: number;
  /** Tasks pushed in after it started. */
  added: number;
  done: number;
  remaining: number;
  daysRemaining: number;
  state: SprintState;
}

export interface OverviewProject {
  id: string;
  name: string;
  logoUrl: string | null;
  teamName: string | null;
  sprint: OverviewSprint | null;
  unstartedSprint: { id: string; name: string; startDate: string } | null;
  lastActivityAt: string | null;
  signals: AttentionSignal[];
}

export interface ClosedSprintTrend {
  id: string;
  name: string;
  projectName: string;
  completedAt: string;
  committed: number;
  committedDone: number;
  added: number;
  /** Share of the promise that shipped, 0 to 1. */
  reliability: number;
}

export interface MissedTask {
  sprintName: string;
  projectName: string;
  title: string;
  reason: string;
}

export interface OverviewTrends {
  /** Most recent closed sprints, oldest first so the strip reads left to right. */
  sprints: ClosedSprintTrend[];
  /** Reliability across every sprint in the window. */
  overallReliability: number | null;
  /** Why work did not finish, straight from the sprint reviews. */
  missedTasks: MissedTask[];
}

/** The four headline numbers. Every one is a task count — never hours. */
export interface OverviewKpis {
  openTasks: number;
  doneTasks: number;
  totalTasks: number;
  /**
   * Net movement in the open-task pile over the last week: opened minus
   * finished. Negative means the backlog shrank, which is the good direction.
   */
  openDelta: number;
  /** Done and total across every running sprint. */
  sprintDone: number;
  sprintTotal: number;
  /** Tasks still open in running sprints, and how many sprints hold them. */
  sprintRemaining: number;
  openSprintCount: number;
  /** Mean tasks delivered per closed sprint, over the trailing window. */
  throughput: number;
  /** Change against the window before it, 0 to 1. Null without enough history. */
  throughputDelta: number | null;
}

export interface ProjectStages {
  projectId: string;
  projectName: string;
  total: number;
  /** Counts per `StageGroup`, always all four keys. */
  stages: Record<StageGroup, number>;
}

/** A sprint that is running or queued, and the work still inside it. */
export interface OpenSprint {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  startDate: string;
  endDate: string;
  done: number;
  total: number;
  remaining: number;
  added: number;
  /** Tasks still open, one point per elapsed day. Empty before it starts. */
  burndown: number[];
}

export interface PortfolioRow {
  projectId: string;
  name: string;
  /** The project's manager, or null when nobody holds that role on it. */
  leadName: string | null;
  /**
   * How far through the live contract's window today sits, 0 to 1. This is the
   * closest thing the system has to a budget: there is no money on a project,
   * but a contract is a fixed span of time being spent down.
   */
  contractElapsed: number | null;
  contractEndsAt: string | null;
  /** Tasks finished on this project in the last 30 days. */
  throughput: number;
  status: DeliveryStatus;
}

export interface ThroughputWeek {
  /** Monday of the week, ISO. */
  weekStart: string;
  count: number;
}

export interface ManagerOverview {
  projects: OverviewProject[];
  /** Everything in scope, for the filter — not just what is being shown. */
  projectOptions: { id: string; name: string }[];
  /** Null when the whole portfolio is in view. */
  selectedProjectId: string | null;
  kpis: OverviewKpis;
  stageDistribution: ProjectStages[];
  openSprints: OpenSprint[];
  portfolio: PortfolioRow[];
  throughputWeeks: ThroughputWeek[];
  /** The viewer's own plate. Not scoped to the projects above — these are theirs
   *  wherever they sit, so the count matches the personal dashboard. */
  nowIso: string;
  /** Projects in scope but with nothing wrong — the healthy tail. */
  healthyCount: number;
  /** Signals this user has parked. Shown as a count so they are not forgotten. */
  snoozedCount: number;
  trends: OverviewTrends;
}

const LIVE_SPRINT_STATUSES = ["ACTIVE", "PLANNED", "NEXT"] as const;

/** Matches the audit module's caps, so one runaway project cannot starve the rest. */
const STUCK_TASK_LIMIT = 500;
const CLIENT_ANSWER_LIMIT = 500;

/** Enough closed sprints to see a direction, few enough to read at a glance. */
const TREND_SPRINT_COUNT = 6;
const MISSED_TASK_LIMIT = 12;

/** How far back the throughput chart looks. */
const THROUGHPUT_WEEKS = 12;
/** The window the per-project throughput column counts over. */
const THROUGHPUT_RECENT_DAYS = 30;
/** Sprints averaged for the headline throughput figure, and its comparison. */
const THROUGHPUT_SPRINT_WINDOW = 3;
/** The week the open-task delta is measured over. */
const DELTA_DAYS = 7;

/**
 * A task can be marked done, rolled back and done again, so completion events
 * are de-duplicated per task. This caps how many are read at all.
 */
const DONE_EVENT_LIMIT = 20000;

/** A sparkline this small cannot show more, and a long sprint should not try. */
const BURNDOWN_MAX_POINTS = 24;

const EMPTY_KPIS: OverviewKpis = {
  openTasks: 0,
  doneTasks: 0,
  totalTasks: 0,
  openDelta: 0,
  sprintDone: 0,
  sprintTotal: 0,
  sprintRemaining: 0,
  openSprintCount: 0,
  throughput: 0,
  throughputDelta: null,
};

const EMPTY_TRENDS: OverviewTrends = {
  sprints: [],
  overallReliability: null,
  missedTasks: [],
};

function snoozeKey(projectId: string, signalType: string): string {
  return `${projectId}:${signalType}`;
}

/**
 * Midnight UTC on the Sunday that starts this week.
 *
 * Sunday because the working week here runs Sunday to Thursday — see
 * `WEEKEND_DAYS` in project-attention.ts. UTC because the buckets are built on
 * the server and read on the client, and a local-time boundary would move a
 * task between weeks depending on who is looking.
 */
function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
  return midnight - d.getUTCDay() * DAY_MS;
}

/**
 * Open tasks at the end of each elapsed day of a sprint.
 *
 * Counts down from the sprint's total, so the line falls as work lands and goes
 * flat when it stops — a flat tail is the shape worth spotting. Sampled to at
 * most one point a day and capped, since this renders as a 40px sparkline.
 */
function burndownSeries(
  total: number,
  completedAt: number[],
  startMs: number,
  endMs: number,
  nowMs: number,
): number[] {
  if (total === 0 || nowMs <= startMs) return [];

  const through = Math.min(nowMs, endMs);
  const days = Math.max(1, Math.ceil((through - startMs) / DAY_MS));
  const points = Math.min(days, BURNDOWN_MAX_POINTS);
  const step = (through - startMs) / points;

  const sorted = [...completedAt].sort((a, b) => a - b);
  const series: number[] = [];
  let cursor = 0;
  for (let i = 1; i <= points; i++) {
    const at = startMs + i * step;
    while (cursor < sorted.length && sorted[cursor] <= at) cursor++;
    series.push(Math.max(0, total - cursor));
  }
  return series;
}

/**
 * Every project the current user may oversee, ranked worst-first.
 *
 * Scope is deliberately narrow: `activeProjectFilter()` keeps this to projects
 * on a live, non-late-paying contract, so internal and finished work does not
 * pad the list. Admins skip the team filter entirely — they oversee everything,
 * including projects that were never assigned to a team.
 */
export async function getManagerOverview(
  /** Narrow the whole page to one project. Ignored if it is out of scope. */
  projectId?: string | null,
): Promise<ManagerOverview> {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No overview permission");

  const now = new Date();
  const nowMs = now.getTime();

  const scopeWhere = {
    ...activeProjectFilter(),
    ...(access.isAdmin
      ? {}
      : { teamId: { in: access.teams.map((t) => t.id) } }),
  };

  // The filter narrows on top of the scope rather than replacing it, so a
  // guessed id in the URL cannot reach a project this user may not oversee.
  const projectWhere = projectId
    ? { AND: [scopeWhere, { id: projectId }] }
    : scopeWhere;

  const [projectOptions, projects] = await Promise.all([
    prisma.project.findMany({
      where: scopeWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),

    prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        createdAt: true,
        team: { select: { name: true } },
        contracts: {
          select: {
            id: true,
            contractType: true,
            label: true,
            startDate: true,
            endDate: true,
            latePayment: true,
          },
        },
        // Whoever manages the project. Several people can hold the role; the
        // first by join date reads as the one who has had it longest.
        members: {
          where: { role: "PROJECT_MANAGER" },
          select: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        sprints: {
          where: { status: { in: [...LIVE_SPRINT_STATUSES] } },
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: "asc" },
        },
      },
    }),

  ]);


  const selectedProjectId =
    projectId && projectOptions.some((p) => p.id === projectId)
      ? projectId
      : null;

  if (projects.length === 0) {
    return {
      projects: [],
      projectOptions,
      selectedProjectId,
      kpis: EMPTY_KPIS,
      stageDistribution: [],
      openSprints: [],
      portfolio: [],
      throughputWeeks: [],
      nowIso: now.toISOString(),
      healthyCount: 0,
      snoozedCount: 0,
      trends: EMPTY_TRENDS,
    };
  }

  const projectIds = projects.map((p) => p.id);
  // Counts are wanted for queued sprints too, so the "unfinished work" board
  // can show a sprint that has not started as 0 of 40 rather than omitting it.
  const liveSprintIds = projects.flatMap((p) => p.sprints).map((s) => s.id);

  const throughputSince = new Date(
    nowMs - THROUGHPUT_WEEKS * 7 * DAY_MS,
  );
  const deltaSince = new Date(nowMs - DELTA_DAYS * DAY_MS);

  const [
    sprintTaskCounts,
    lastActivity,
    lastClosedSprint,
    stuckTasks,
    clientAnswers,
    closedSprints,
    snoozes,
    stageCounts,
    doneEvents,
    openedThisWeek,
  ] = await Promise.all([
    // Committed, added and done for every live sprint, in one pass.
    liveSprintIds.length > 0
      ? prisma.task.groupBy({
          by: ["sprintId", "stage", "unplannedInSprint"],
          where: { sprintId: { in: liveSprintIds }, archivedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),

    prisma.task.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, archivedAt: null },
      _max: { updatedAt: true },
    }),

    // Only closed sprints carry completedAt, and it is written from the sprint
    // review document's date rather than the moment of closing, so it can be
    // backdated. Close enough for a three-day planning gap.
    prisma.sprint.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, completedAt: { not: null } },
      _max: { completedAt: true },
    }),

    // The open stage visit per working task, for the chronic flag. Same rule as
    // the audit module: only stages where being slow is somebody's fault.
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        stage: { in: [...ACTIVE_STAGES] },
        startedAt: { not: null },
        archivedAt: null,
      },
      select: {
        projectId: true,
        stageLogs: {
          where: { exitedAt: null },
          orderBy: { enteredAt: "desc" },
          take: 1,
          select: { enteredAt: true },
        },
      },
      take: STUCK_TASK_LIMIT,
    }),

    // Tasks parked in Backlog on an unanswered client question.
    prisma.taskAnswer.findMany({
      where: {
        question: { type: "client" },
        task: {
          stage: "BACKLOG",
          archivedAt: null,
          projectId: { in: projectIds },
        },
      },
      select: {
        answer: true,
        task: {
          select: {
            id: true,
            projectId: true,
            stageLogs: {
              where: { exitedAt: null },
              orderBy: { enteredAt: "desc" },
              take: 1,
              select: { enteredAt: true },
            },
          },
        },
      },
      take: CLIENT_ANSWER_LIMIT,
    }),

    // Closed sprints for the trend strip, read through their snapshots.
    prisma.sprint.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: ["COMPLETED", "PARTIALLY_COMPLETED", "SHIPPED"] },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: TREND_SPRINT_COUNT,
      select: {
        id: true,
        name: true,
        completedAt: true,
        project: { select: { name: true } },
        snapshots: {
          select: {
            stage: true,
            unplannedInSprint: true,
            incompleteReason: true,
            task: { select: { title: true } },
          },
        },
      },
    }),

    // Expired rows are simply not read; a nightly cleanup is not worth a job.
    prisma.overviewSnooze.findMany({
      where: { userId: access.userId, until: { gt: now } },
      select: { projectId: true, signalType: true },
    }),

    // Every task by project and stage. Feeds the stage bars and, summed, the
    // open/done/total headline — so those two can never disagree.
    prisma.task.groupBy({
      by: ["projectId", "stage"],
      where: { projectId: { in: projectIds }, archivedAt: null },
      _count: { _all: true },
    }),

    // Completion events. One query serves three readings: tasks per week for
    // the chart, tasks per project for the portfolio column, and the per-sprint
    // burndowns. `sprintId` is denormalised onto the log, so a sprint's history
    // survives the task being moved off it later.
    prisma.stageLog.findMany({
      where: {
        stage: "DONE",
        enteredAt: { gte: throughputSince },
        task: { projectId: { in: projectIds }, archivedAt: null },
      },
      select: {
        taskId: true,
        sprintId: true,
        enteredAt: true,
        task: { select: { projectId: true } },
      },
      orderBy: { enteredAt: "asc" },
      take: DONE_EVENT_LIMIT,
    }),

    prisma.task.count({
      where: {
        projectId: { in: projectIds },
        archivedAt: null,
        createdAt: { gte: deltaSince },
      },
    }),
  ]);

  const snoozedKeys = new Set(
    snoozes.map((s) => snoozeKey(s.projectId, s.signalType)),
  );

  const countsBySprint = new Map<
    string,
    { committed: number; added: number; done: number }
  >();
  for (const row of sprintTaskCounts) {
    if (!row.sprintId) continue;
    const bucket = countsBySprint.get(row.sprintId) ?? {
      committed: 0,
      added: 0,
      done: 0,
    };
    const n = row._count._all;
    // startSprint clears unplannedInSprint on everything at the moment it
    // starts, so anything still flagged was pushed in afterwards.
    if (row.unplannedInSprint) bucket.added += n;
    else bucket.committed += n;
    if (row.stage === "DONE") bucket.done += n;
    countsBySprint.set(row.sprintId, bucket);
  }

  const activityByProject = new Map(
    lastActivity.map((r) => [r.projectId, r._max.updatedAt ?? null]),
  );
  const lastSprintEndByProject = new Map(
    lastClosedSprint.map((r) => [r.projectId, r._max.completedAt ?? null]),
  );

  // Longest single stage visit per project. The threshold itself lives in the
  // pure module, so this only has to find the worst one.
  const worstStuckByProject = new Map<string, number>();
  for (const task of stuckTasks) {
    const log = task.stageLogs[0];
    if (!log) continue;
    const stageMs = nowMs - new Date(log.enteredAt).getTime();
    const worst = worstStuckByProject.get(task.projectId) ?? 0;
    if (stageMs > worst) worstStuckByProject.set(task.projectId, stageMs);
  }

  // A task can carry several client questions, so count tasks and not answers.
  const blockedTasksByProject = new Map<string, Set<string>>();
  for (const answer of clientAnswers) {
    let parsed: { needed?: boolean; completed?: boolean };
    try {
      parsed = JSON.parse(answer.answer);
    } catch {
      continue;
    }
    if (!parsed.needed || parsed.completed) continue;

    const log = answer.task.stageLogs[0];
    const waitingMs = log ? nowMs - new Date(log.enteredAt).getTime() : 0;
    if (waitingMs < CLIENT_INPUT_WAIT_MS) continue;

    const set =
      blockedTasksByProject.get(answer.task.projectId) ?? new Set<string>();
    set.add(answer.task.id);
    blockedTasksByProject.set(answer.task.projectId, set);
  }

  // A task rolled back out of Done and finished again logs twice. Only the last
  // event counts, or a project that reworks tasks looks more productive than
  // one that gets them right first time.
  const lastCompletion = new Map<
    string,
    { projectId: string; sprintId: string | null; at: number }
  >();
  for (const event of doneEvents) {
    lastCompletion.set(event.taskId, {
      projectId: event.task.projectId,
      sprintId: event.sprintId,
      at: new Date(event.enteredAt).getTime(),
    });
  }
  const completions = [...lastCompletion.values()];

  const weekCounts = new Map<number, number>();
  for (let i = 0; i < THROUGHPUT_WEEKS; i++) {
    weekCounts.set(startOfWeekMs(nowMs - i * 7 * DAY_MS), 0);
  }
  for (const done of completions) {
    const week = startOfWeekMs(done.at);
    if (weekCounts.has(week)) weekCounts.set(week, weekCounts.get(week)! + 1);
  }
  const throughputWeeks: ThroughputWeek[] = [...weekCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, count]) => ({
      weekStart: new Date(weekStart).toISOString(),
      count,
    }));

  const recentSince = nowMs - THROUGHPUT_RECENT_DAYS * DAY_MS;
  const deltaSinceMs = deltaSince.getTime();
  const throughputByProject = new Map<string, number>();
  let completedThisWeek = 0;
  for (const done of completions) {
    if (done.at >= recentSince) {
      throughputByProject.set(
        done.projectId,
        (throughputByProject.get(done.projectId) ?? 0) + 1,
      );
    }
    if (done.at >= deltaSinceMs) completedThisWeek++;
  }

  // Completion timestamps per sprint, for the burndowns.
  const completionsBySprint = new Map<string, number[]>();
  for (const done of completions) {
    if (!done.sprintId) continue;
    const list = completionsBySprint.get(done.sprintId) ?? [];
    list.push(done.at);
    completionsBySprint.set(done.sprintId, list);
  }

  const stagesByProject = new Map<string, Record<StageGroup, number>>();
  let openTasks = 0;
  let doneTasks = 0;
  for (const row of stageCounts) {
    const bucket = stagesByProject.get(row.projectId) ?? emptyStageCounts();
    const n = row._count._all;
    bucket[stageGroup(row.stage)] += n;
    stagesByProject.set(row.projectId, bucket);
    if (isDoneStage(row.stage)) doneTasks += n;
    else openTasks += n;
  }

  let snoozedCount = 0;

  const rows: OverviewProject[] = projects.map((project) => {
    const active = project.sprints.find((s) => s.status === "ACTIVE") ?? null;
    const unstarted =
      project.sprints.find((s) => s.status === "NEXT") ??
      project.sprints.find((s) => s.status === "PLANNED") ??
      null;

    const counts = active
      ? (countsBySprint.get(active.id) ?? { committed: 0, added: 0, done: 0 })
      : null;

    const lastActivityAt = activityByProject.get(project.id) ?? null;
    const lastSprintEndedAt = lastSprintEndByProject.get(project.id) ?? null;

    const allSignals = projectSignals(
      {
        activeSprint:
          active && counts
            ? {
                name: active.name,
                startDate: active.startDate,
                endDate: active.endDate,
                ...counts,
              }
            : null,
        unstartedSprint: unstarted
          ? { name: unstarted.name, startDate: unstarted.startDate }
          : null,
        lastActivityAt,
        lastSprintEndedAt,
        createdAt: project.createdAt,
        clientBlockedCount: blockedTasksByProject.get(project.id)?.size ?? 0,
        worstStuckMs: worstStuckByProject.get(project.id) ?? null,
      },
      nowMs,
    );

    const signals = allSignals.filter(
      (s) => !snoozedKeys.has(snoozeKey(project.id, s.type)),
    );
    snoozedCount += allSignals.length - signals.length;

    let sprint: OverviewSprint | null = null;
    if (active && counts) {
      const verdict = sprintVerdict(
        {
          startDate: active.startDate,
          endDate: active.endDate,
          ...counts,
        },
        nowMs,
      );
      sprint = {
        id: active.id,
        name: active.name,
        startDate: active.startDate.toISOString(),
        endDate: active.endDate.toISOString(),
        committed: verdict.committed,
        added: verdict.added,
        done: verdict.done,
        remaining: verdict.remaining,
        daysRemaining: verdict.daysRemaining,
        state: verdict.state,
      };
    }

    return {
      id: project.id,
      name: project.name,
      logoUrl: project.logoUrl,
      teamName: project.team?.name ?? null,
      sprint,
      unstartedSprint: unstarted
        ? {
            id: unstarted.id,
            name: unstarted.name,
            startDate: unstarted.startDate.toISOString(),
          }
        : null,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      signals,
    };
  });

  rows.sort(compareProjects);

  const signalsByProject = new Map(rows.map((r) => [r.id, r.signals]));

  const stageDistribution: ProjectStages[] = projects
    .map((project) => {
      const stages = stagesByProject.get(project.id) ?? emptyStageCounts();
      const total = Object.values(stages).reduce((sum, n) => sum + n, 0);
      return {
        projectId: project.id,
        projectName: project.name,
        total,
        stages,
      };
    })
    // A project with no tasks draws an empty column and says nothing.
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  const portfolio: PortfolioRow[] = projects
    .map((project) => {
      const contract = getActiveContract(project.contracts);
      let contractElapsed: number | null = null;
      if (contract?.startDate && contract.endDate) {
        const start = new Date(contract.startDate).getTime();
        const end = new Date(contract.endDate).getTime();
        if (end > start) {
          contractElapsed = Math.min(
            1,
            Math.max(0, (nowMs - start) / (end - start)),
          );
        }
      }

      const lead = project.members[0]?.user;
      return {
        projectId: project.id,
        name: project.name,
        leadName: lead?.name || lead?.email || null,
        contractElapsed,
        contractEndsAt: contract?.endDate
          ? new Date(contract.endDate).toISOString()
          : null,
        throughput: throughputByProject.get(project.id) ?? 0,
        status: deliveryStatus(signalsByProject.get(project.id) ?? []),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const openSprints: OpenSprint[] = [];
  for (const project of projects) {
    for (const sprint of project.sprints) {
      const counts = countsBySprint.get(sprint.id);
      if (!counts) continue;
      const total = counts.committed + counts.added;
      if (total === 0) continue;

      const startMs = sprint.startDate.getTime();
      openSprints.push({
        id: sprint.id,
        name: sprint.name,
        projectId: project.id,
        projectName: project.name,
        status: sprint.status,
        startDate: sprint.startDate.toISOString(),
        endDate: sprint.endDate.toISOString(),
        done: counts.done,
        total,
        remaining: Math.max(0, total - counts.done),
        added: counts.added,
        burndown: burndownSeries(
          total,
          completionsBySprint.get(sprint.id) ?? [],
          startMs,
          sprint.endDate.getTime(),
          nowMs,
        ),
      });
    }
  }
  // Most work left first — that is the order a manager triages in.
  openSprints.sort((a, b) => b.remaining - a.remaining);

  const running = openSprints.filter((s) => s.status === "ACTIVE");
  const sprintDone = running.reduce((sum, s) => sum + s.done, 0);
  const sprintTotal = running.reduce((sum, s) => sum + s.total, 0);

  const throughput = averageDelivered(closedSprints, 0);
  const previous = averageDelivered(closedSprints, THROUGHPUT_SPRINT_WINDOW);

  return {
    projects: rows,
    projectOptions,
    selectedProjectId,
    kpis: {
      openTasks,
      doneTasks,
      totalTasks: openTasks + doneTasks,
      openDelta: openedThisWeek - completedThisWeek,
      sprintDone,
      sprintTotal,
      sprintRemaining: running.reduce((sum, s) => sum + s.remaining, 0),
      openSprintCount: running.length,
      throughput,
      throughputDelta:
        previous > 0 ? (throughput - previous) / previous : null,
    },
    stageDistribution,
    openSprints,
    portfolio,
    throughputWeeks,
    nowIso: now.toISOString(),
    healthyCount: rows.filter((r) => r.signals.length === 0).length,
    snoozedCount,
    trends: buildTrends(closedSprints),
  };
}

/**
 * Mean tasks delivered per closed sprint over one window of the history.
 *
 * `closedSprints` arrives newest first, so `skip` steps back a window at a time:
 * 0 is the latest three sprints and 3 is the three before them, which is what
 * the headline figure is compared against.
 */
function averageDelivered(closed: ClosedSprintRow[], skip: number): number {
  const window = closed.slice(skip, skip + THROUGHPUT_SPRINT_WINDOW);
  if (window.length === 0) return 0;
  // Everything that shipped, committed or added. Reliability is the metric that
  // holds a sprint to its promise; this one is just capacity.
  const delivered = window.reduce(
    (sum, sprint) =>
      sum + sprint.snapshots.filter((s) => s.stage === "DONE").length,
    0,
  );
  return Math.round(delivered / window.length);
}

/**
 * Park one signal on one project for a while.
 *
 * The alternative to this is a manager learning to ignore the whole feed because
 * a deliberately paused project has been pinned to the top of it for a month.
 */
export async function snoozeOverviewSignal(
  projectId: string,
  signalType: string,
  days: number,
): Promise<void> {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No overview permission");

  if (!Number.isFinite(days) || days <= 0 || days > MAX_SNOOZE_DAYS) {
    throw new Error("Pick a snooze length between 1 and 30 days");
  }

  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await prisma.overviewSnooze.upsert({
    where: {
      userId_projectId_signalType: {
        userId: access.userId,
        projectId,
        signalType,
      },
    },
    create: { userId: access.userId, projectId, signalType, until },
    update: { until },
  });

  revalidatePath("/dashboard");
}

/** Bring every parked signal back. */
export async function clearOverviewSnoozes(): Promise<void> {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No overview permission");

  await prisma.overviewSnooze.deleteMany({ where: { userId: access.userId } });
  revalidatePath("/dashboard");
}

type ClosedSprintRow = {
  id: string;
  name: string;
  completedAt: Date | null;
  project: { name: string };
  snapshots: {
    stage: string;
    unplannedInSprint: boolean;
    incompleteReason: string | null;
    task: { title: string } | null;
  }[];
};

function buildTrends(closedSprints: ClosedSprintRow[]): OverviewTrends {
  if (closedSprints.length === 0) return EMPTY_TRENDS;

  // Queried newest-first for the `take`; reversed so the strip reads forward.
  const ordered = [...closedSprints].reverse();

  const sprints: ClosedSprintTrend[] = ordered.map((sprint) => {
    const outcome = sprintOutcome(sprint.snapshots);
    return {
      id: sprint.id,
      name: sprint.name,
      projectName: sprint.project.name,
      completedAt: (sprint.completedAt ?? new Date()).toISOString(),
      committed: outcome.committed,
      committedDone: outcome.committedDone,
      added: outcome.added,
      reliability: outcome.reliability,
    };
  });

  const totalCommitted = sprints.reduce((sum, s) => sum + s.committed, 0);
  const totalDelivered = sprints.reduce((sum, s) => sum + s.committedDone, 0);

  const missedTasks: MissedTask[] = [];
  for (const sprint of ordered) {
    for (const snapshot of sprint.snapshots) {
      const reason = snapshot.incompleteReason?.trim();
      if (!reason) continue;
      missedTasks.push({
        sprintName: sprint.name,
        projectName: sprint.project.name,
        title: snapshot.task?.title ?? "Untitled task",
        reason,
      });
    }
  }

  return {
    sprints,
    overallReliability:
      totalCommitted > 0 ? totalDelivered / totalCommitted : null,
    // Newest first: the most recent review is the one worth reading.
    missedTasks: missedTasks.reverse().slice(0, MISSED_TASK_LIMIT),
  };
}
