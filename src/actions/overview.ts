"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuditAccess } from "@/actions/audit";
import { activeProjectFilter } from "@/lib/project-filters";
import { ACTIVE_STAGES, CLIENT_INPUT_WAIT_MS } from "@/lib/audit-flags";
import {
  MAX_SNOOZE_DAYS,
  compareProjects,
  projectSignals,
  sprintOutcome,
  sprintVerdict,
  type AttentionSignal,
  type SprintState,
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

export interface ManagerOverview {
  projects: OverviewProject[];
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

const EMPTY_TRENDS: OverviewTrends = {
  sprints: [],
  overallReliability: null,
  missedTasks: [],
};

function snoozeKey(projectId: string, signalType: string): string {
  return `${projectId}:${signalType}`;
}

/**
 * Every project the current user may oversee, ranked worst-first.
 *
 * Scope is deliberately narrow: `activeProjectFilter()` keeps this to projects
 * on a live, non-late-paying contract, so internal and finished work does not
 * pad the list. Admins skip the team filter entirely — they oversee everything,
 * including projects that were never assigned to a team.
 */
export async function getManagerOverview(): Promise<ManagerOverview> {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No overview permission");

  const now = new Date();
  const nowMs = now.getTime();

  const projectWhere = {
    ...activeProjectFilter(),
    ...(access.isAdmin
      ? {}
      : { teamId: { in: access.teams.map((t) => t.id) } }),
  };

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      name: true,
      logoUrl: true,
      createdAt: true,
      team: { select: { name: true } },
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
  });

  if (projects.length === 0) {
    return {
      projects: [],
      nowIso: now.toISOString(),
      healthyCount: 0,
      snoozedCount: 0,
      trends: EMPTY_TRENDS,
    };
  }

  const projectIds = projects.map((p) => p.id);
  const activeSprintIds = projects
    .flatMap((p) => p.sprints)
    .filter((s) => s.status === "ACTIVE")
    .map((s) => s.id);

  const [
    sprintTaskCounts,
    lastActivity,
    lastClosedSprint,
    stuckTasks,
    clientAnswers,
    closedSprints,
    snoozes,
  ] = await Promise.all([
    // Committed, added and done for every running sprint, in one pass.
    activeSprintIds.length > 0
      ? prisma.task.groupBy({
          by: ["sprintId", "stage", "unplannedInSprint"],
          where: { sprintId: { in: activeSprintIds }, archivedAt: null },
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

  return {
    projects: rows,
    nowIso: now.toISOString(),
    healthyCount: rows.filter((r) => r.signals.length === 0).length,
    snoozedCount,
    trends: buildTrends(closedSprints),
  };
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

  revalidatePath("/dashboard/overview");
}

/** Bring every parked signal back. */
export async function clearOverviewSnoozes(): Promise<void> {
  const access = await getAuditAccess();
  if (!access.canAudit) throw new Error("No overview permission");

  await prisma.overviewSnooze.deleteMany({ where: { userId: access.userId } });
  revalidatePath("/dashboard/overview");
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
