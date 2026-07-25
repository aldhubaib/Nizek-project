"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
// Expired and late-payment projects are excluded from every task-level
// dashboard monitor (same rule as the Expired badge on project cards).
import { activeProjectFilter } from "@/lib/project-filters";

export async function getDashboardData(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);

  const [tasks, project, mentions] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, archivedAt: null },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        taskType: true,
        stage: true,
        priority: true,
        assigneeId: true,
        startedAt: true,
        assignee: { select: { id: true, name: true, imageUrl: true } },
      },
    }),

    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        contracts: {
          select: { startDate: true, endDate: true, label: true, contractType: true },
          orderBy: { endDate: "desc" },
        },
      },
    }),

    prisma.taskCommentMention.findMany({
      where: { userId: user.id, comment: { task: { projectId } } },
      include: {
        comment: {
          include: {
            task: {
              select: { id: true, title: true, taskNumber: true, taskType: true, projectId: true },
            },
            user: { select: { id: true, name: true, imageUrl: true } },
          },
        },
      },
      orderBy: { comment: { createdAt: "desc" } },
      take: 20,
    }),
  ]);

  const [recentActivity, stageLogs, clientAnswers, declineActivities] = await Promise.all([
    prisma.taskActivity.findMany({
      where: { task: { projectId } },
      include: {
        user: { select: { id: true, name: true, imageUrl: true } },
        task: { select: { id: true, title: true, taskNumber: true, taskType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),

    prisma.stageLog.findMany({
      where: { task: { projectId }, exitedAt: { not: null } },
      select: { stage: true, enteredAt: true, exitedAt: true },
      orderBy: { exitedAt: "desc" },
      take: 500,
    }),

    prisma.taskAnswer.findMany({
      where: {
        task: { projectId },
        question: { type: "client" },
      },
      select: {
        answer: true,
        taskId: true,
        task: {
          select: { id: true, title: true, taskNumber: true, taskType: true, stage: true, priority: true },
        },
      },
      take: 200,
    }),

    prisma.taskActivity.findMany({
      where: { task: { projectId }, action: "declined" },
      select: {
        id: true,
        oldValue: true,
        createdAt: true,
        user: { select: { id: true, name: true, imageUrl: true } },
        task: { select: { id: true, title: true, taskNumber: true, taskType: true, stage: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const now = new Date();

  // Stats
  const totalTasks = tasks.length;
  const byStage: Record<string, number> = {};
  for (const t of tasks) {
    byStage[t.stage] = (byStage[t.stage] ?? 0) + 1;
  }
  const doneTasks = byStage["DONE"] ?? 0;
  const inProgress = totalTasks - (byStage["NEW_REQUEST"] ?? 0) - (byStage["CLARIFICATION"] ?? 0) - doneTasks;

  // Contract countdown
  const activeContract = project?.contracts.find(
    (c) => {
      if (!c.startDate || !c.endDate) return false;
      const end = new Date(c.endDate);
      end.setHours(23, 59, 59, 999);
      return new Date(c.startDate) <= now && end >= now;
    }
  );
  const daysLeft = activeContract?.endDate
    ? Math.ceil((new Date(activeContract.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // My tasks
  const myTasks = tasks
    .filter((t) => t.assigneeId === user.id)
    .map((t) => ({
      id: t.id,
      title: t.title,
      taskNumber: t.taskNumber,
      taskType: t.taskType,
      stage: t.stage,
      priority: t.priority,
    }));

  // Stage averages for stalling detection
  const stageAvg: Record<string, { total: number; count: number }> = {};
  for (const log of stageLogs) {
    if (!log.exitedAt) continue;
    const dur = new Date(log.exitedAt).getTime() - new Date(log.enteredAt).getTime();
    if (!stageAvg[log.stage]) stageAvg[log.stage] = { total: 0, count: 0 };
    stageAvg[log.stage].total += dur;
    stageAvg[log.stage].count += 1;
  }
  const avgByStage: Record<string, number> = {};
  for (const [stage, data] of Object.entries(stageAvg)) {
    avgByStage[stage] = data.count > 0 ? data.total / data.count : 0;
  }

  // Stalling tasks: currently in active stages, taking 2x+ average
  const activeStages = ["READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE"];
  const activeTasks = tasks.filter((t) => activeStages.includes(t.stage) && t.startedAt);

  const currentStageLogs = await prisma.stageLog.findMany({
    where: {
      taskId: { in: activeTasks.map((t) => t.id) },
      exitedAt: null,
    },
    select: { taskId: true, stage: true, enteredAt: true },
  });

  const currentLogMap = new Map(currentStageLogs.map((l) => [l.taskId, l]));

  const stallingTasks = activeTasks
    .map((t) => {
      const log = currentLogMap.get(t.id);
      if (!log) return null;
      const timeInStage = now.getTime() - new Date(log.enteredAt).getTime();
      const avg = avgByStage[t.stage] ?? 0;
      const ratio = avg > 0 ? timeInStage / avg : 0;
      if (ratio < 2) return null;
      return {
        id: t.id,
        title: t.title,
        taskNumber: t.taskNumber,
        taskType: t.taskType,
        stage: t.stage,
        priority: t.priority,
        timeInStage,
        avgTime: avg,
        ratio,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.ratio ?? 0) - (a?.ratio ?? 0));

  // Client requirements
  const clientReqs = clientAnswers
    .map((a) => {
      try {
        const parsed = JSON.parse(a.answer);
        if (parsed.needed && !parsed.completed) {
          return {
            taskId: a.task.id,
            title: a.task.title,
            taskNumber: a.task.taskNumber,
            taskType: a.task.taskType,
            stage: a.task.stage,
            priority: a.task.priority,
            note: parsed.note ?? "",
          };
        }
      } catch {}
      return null;
    })
    .filter(Boolean);

  const mentionsList = mentions
    .map((m) => ({
      id: m.id,
      readAt: m.readAt?.toISOString() ?? null,
      taskId: m.comment.task.id,
      taskTitle: m.comment.task.title,
      taskNumber: m.comment.task.taskNumber,
      taskType: m.comment.task.taskType,
      comment: m.comment.content,
      commentedBy: m.comment.user,
      commentedAt: m.comment.createdAt.toISOString(),
    }));

  const unreadMentionCount = mentionsList.filter((m) => !m.readAt).length;

  // Activity
  const activity = recentActivity.map((a) => ({
    id: a.id,
    action: a.action,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    user: a.user,
    task: a.task,
    createdAt: a.createdAt.toISOString(),
  }));

  // Team workload
  const workload: Record<string, { name: string; imageUrl: string | null; count: number; tasks: { stage: string }[] }> = {};
  for (const t of tasks) {
    if (!t.assignee || t.stage === "DONE") continue;
    const uid = t.assignee.id;
    if (!workload[uid]) {
      workload[uid] = { name: t.assignee.name ?? "Unknown", imageUrl: t.assignee.imageUrl, count: 0, tasks: [] };
    }
    workload[uid].count += 1;
    workload[uid].tasks.push({ stage: t.stage });
  }
  const teamWorkload = Object.entries(workload)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.count - a.count);

  // Rejections breakdown
  const rejectionsByTask: Record<string, {
    task: { id: string; title: string; taskNumber: number; taskType: string; stage: string };
    internal: { count: number; declines: { user: { id: string; name: string | null; imageUrl: string | null }; date: string }[] };
    client: { count: number; declines: { user: { id: string; name: string | null; imageUrl: string | null }; date: string }[] };
  }> = {};

  for (const d of declineActivities) {
    const key = d.task.id;
    if (!rejectionsByTask[key]) {
      rejectionsByTask[key] = {
        task: d.task,
        internal: { count: 0, declines: [] },
        client: { count: 0, declines: [] },
      };
    }
    const entry = rejectionsByTask[key];
    const isClient = d.oldValue === "CLIENT_REVIEW";
    const bucket = isClient ? entry.client : entry.internal;
    bucket.count += 1;
    bucket.declines.push({ user: d.user, date: d.createdAt.toISOString() });
  }

  const rejections = Object.values(rejectionsByTask)
    .sort((a, b) => (b.internal.count + b.client.count) - (a.internal.count + a.client.count));

  const totalInternalDeclines = rejections.reduce((s, r) => s + r.internal.count, 0);
  const totalClientDeclines = rejections.reduce((s, r) => s + r.client.count, 0);

  return {
    stats: { totalTasks, inProgress, doneTasks, byStage },
    contract: activeContract
      ? { daysLeft: daysLeft!, endDate: activeContract.endDate?.toISOString() ?? null, label: activeContract.label }
      : null,
    myTasks,
    stallingTasks,
    clientReqs,
    mentions: mentionsList,
    unreadMentionCount,
    activity,
    teamWorkload,
    pipeline: byStage,
    rejections: {
      totalInternal: totalInternalDeclines,
      totalClient: totalClientDeclines,
      tasks: rejections,
    },
  };
}

const STAGE_LABELS: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

// Task-level visibility for the dashboard task monitors: admins, PMs and tech
// leads see every task in the projects they can access; everyone else sees
// only tasks they're working on — unless their project role is flagged Team
// Lead (ProjectRole.isTeamLead), which reveals all of that project's tasks
// and late items to them.
function taskVisibilityFilter(user: { id: string; systemRole: string }) {
  if (
    user.systemRole === "ADMIN" ||
    user.systemRole === "PM" ||
    user.systemRole === "TECH_LEAD"
  ) {
    return {};
  }
  return {
    OR: [
      { assigneeId: user.id },
      { developerId: user.id },
      { project: { members: { some: { userId: user.id, projectRole: { is: { isTeamLead: true } } } } } },
    ],
  };
}

export async function getLongestInPipeline(stages?: string[], assigneeId?: string) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const now = new Date();

  const activeStages = stages ?? [
    "READY_FOR_DEV",
    "IN_DEVELOPMENT",
    "INTERNAL_REVIEW",
    "CLIENT_REVIEW",
    "READY_FOR_RELEASE",
  ];

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const tasks = await prisma.task.findMany({
    where: {
      stage: { in: activeStages as any },
      startedAt: { not: null },
      project: { ...whereClause, ...activeProjectFilter() },
      ...(assigneeId ? { assigneeId } : {}),
      ...taskVisibilityFilter(user),
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      stage: true,
      priority: true,
      startedAt: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 100,
  });

  if (tasks.length === 0) return [];

  const currentStageLogs = await prisma.stageLog.findMany({
    where: {
      taskId: { in: tasks.map((t) => t.id) },
      exitedAt: null,
    },
    select: { taskId: true, stage: true, enteredAt: true },
  });

  const stageLogMap = new Map(currentStageLogs.map((l) => [l.taskId, l]));

  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  return tasks
    .map((t) => {
      const log = stageLogMap.get(t.id);
      const stageMs = log ? now.getTime() - new Date(log.enteredAt).getTime() : 0;
      if (stageMs < TWO_DAYS_MS) return null;

      return {
        id: t.id,
        title: t.title,
        taskNumber: t.taskNumber,
        taskType: t.taskType,
        stage: t.stage,
        stageLabel: STAGE_LABELS[t.stage] ?? t.stage,
        priority: t.priority,
        assignee: t.assignee,
        project: t.project,
        stageMs,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => b.stageMs - a.stageMs);
}

export async function getLongestInStageByAssignee(stages?: string[], thresholdDays = 2) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const now = new Date();

  const activeStages = stages ?? [
    "READY_FOR_DEV",
    "IN_DEVELOPMENT",
    "INTERNAL_REVIEW",
    "CLIENT_REVIEW",
    "READY_FOR_RELEASE",
  ];

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const tasks = await prisma.task.findMany({
    where: {
      stage: { in: activeStages as any },
      startedAt: { not: null },
      assigneeId: { not: null },
      project: { ...whereClause, ...activeProjectFilter() },
      ...taskVisibilityFilter(user),
    },
    select: {
      id: true,
      stage: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  if (tasks.length === 0) return [];

  const currentStageLogs = await prisma.stageLog.findMany({
    where: {
      taskId: { in: tasks.map((t) => t.id) },
      exitedAt: null,
    },
    select: { taskId: true, enteredAt: true },
  });

  const stageLogMap = new Map(currentStageLogs.map((l) => [l.taskId, l]));

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  const byAssignee: Record<string, {
    assignee: { id: string; name: string | null; imageUrl: string | null };
    lateCount: number;
    longestMs: number;
  }> = {};

  for (const t of tasks) {
    if (!t.assignee) continue;
    const log = stageLogMap.get(t.id);
    const stageMs = log ? now.getTime() - new Date(log.enteredAt).getTime() : 0;
    if (stageMs < thresholdMs) continue;

    const uid = t.assignee.id;
    if (!byAssignee[uid]) {
      byAssignee[uid] = { assignee: t.assignee, lateCount: 0, longestMs: 0 };
    }
    byAssignee[uid].lateCount++;
    if (stageMs > byAssignee[uid].longestMs) {
      byAssignee[uid].longestMs = stageMs;
    }
  }

  return Object.values(byAssignee).sort((a, b) => b.lateCount - a.lateCount);
}

export async function getShippedSummary() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const doneTasks = await prisma.task.findMany({
    where: {
      stage: "DONE",
      project: { ...whereClause, ...activeProjectFilter() },
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const byType: Record<string, number> = {};
  const byProject: Record<string, { name: string; count: number }> = {};

  for (const t of doneTasks) {
    byType[t.taskType] = (byType[t.taskType] ?? 0) + 1;
    if (!byProject[t.project.id]) {
      byProject[t.project.id] = { name: t.project.name, count: 0 };
    }
    byProject[t.project.id].count++;
  }

  const typeBreakdown = Object.entries(byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const projectBreakdown = Object.entries(byProject)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.count - a.count);

  return {
    total: doneTasks.length,
    typeBreakdown,
    projectBreakdown,
    recentShipped: doneTasks.slice(0, 50),
  };
}

export async function getMostRejectedTasks() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const declineActivities = await prisma.taskActivity.findMany({
    where: {
      action: "declined",
      task: { stage: { not: "DONE" }, project: { ...whereClause, ...activeProjectFilter() } },
    },
    select: {
      id: true,
      oldValue: true,
      createdAt: true,
      user: { select: { id: true, name: true, imageUrl: true } },
      task: {
        select: {
          id: true,
          title: true,
          taskNumber: true,
          taskType: true,
          stage: true,
          projectId: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (declineActivities.length === 0) return [];

  const byTask: Record<string, {
    task: typeof declineActivities[0]["task"];
    internalCount: number;
    clientCount: number;
    totalCount: number;
    lastRejectedAt: string;
    lastRejectedBy: { id: string; name: string | null; imageUrl: string | null };
  }> = {};

  for (const d of declineActivities) {
    const key = d.task.id;
    const isClient = d.oldValue === "CLIENT_REVIEW";
    if (!byTask[key]) {
      byTask[key] = {
        task: d.task,
        internalCount: 0,
        clientCount: 0,
        totalCount: 0,
        lastRejectedAt: d.createdAt.toISOString(),
        lastRejectedBy: d.user,
      };
    }
    const entry = byTask[key];
    if (isClient) entry.clientCount++;
    else entry.internalCount++;
    entry.totalCount++;
  }

  return Object.values(byTask)
    .filter((t) => t.totalCount > 2)
    .sort((a, b) => b.totalCount - a.totalCount);
}

export async function markMentionRead(mentionId: string) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  await prisma.taskCommentMention.updateMany({
    where: { id: mentionId, userId: user.id },
    data: { readAt: new Date() },
  });
}

export async function getContractsHealth() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const now = new Date();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const projects = await prisma.project.findMany({
    where: {
      ...whereClause,
      contracts: {
        some: {
          endDate: { gte: now },
          latePayment: false,
        },
      },
    },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      contracts: {
        where: { endDate: { not: null }, startDate: { not: null } },
        select: {
          id: true,
          contractType: true,
          startDate: true,
          endDate: true,
          code: true,
          label: true,
        },
        orderBy: { endDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return projects.map((p) => {
    const contracts = p.contracts;
    const lastContract = contracts[contracts.length - 1];
    const lastEndDate = lastContract?.endDate ? new Date(lastContract.endDate) : null;
    const daysLeft = lastEndDate
      ? Math.ceil((lastEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const activeContract = contracts.find(
      (c) => {
        if (!c.startDate || !c.endDate) return false;
        const end = new Date(c.endDate);
        end.setHours(23, 59, 59, 999);
        return new Date(c.startDate) <= now && end >= now;
      }
    );

    const nextContract = activeContract
      ? contracts.find(
          (c) =>
            c.id !== activeContract.id &&
            c.startDate &&
            new Date(c.startDate) > now
        )
      : null;

    const typeTransition =
      activeContract && nextContract && activeContract.contractType !== nextContract.contractType
        ? { from: activeContract.contractType, to: nextContract.contractType }
        : null;

    return {
      id: p.id,
      name: p.name,
      logoUrl: p.logoUrl,
      daysLeft,
      endDate: lastEndDate?.toISOString() ?? null,
      currentType: activeContract?.contractType ?? lastContract?.contractType ?? null,
      contractCode: activeContract?.code ?? lastContract?.code ?? null,
      typeTransition,
      contractCount: contracts.length,
    };
  }).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

export async function getUnreadMentions() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const mentions = await prisma.taskCommentMention.findMany({
    where: {
      userId: user.id,
      readAt: null,
    },
    include: {
      comment: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              taskNumber: true,
              taskType: true,
              projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
          user: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
    orderBy: { comment: { createdAt: "desc" } },
    take: 50,
  });

  return mentions.map((m) => ({
    id: m.id,
    taskId: m.comment.task.id,
    taskTitle: m.comment.task.title,
    taskNumber: m.comment.task.taskNumber,
    taskType: m.comment.task.taskType,
    projectId: m.comment.task.projectId,
    projectName: m.comment.task.project.name,
    comment: m.comment.content,
    commentedBy: m.comment.user,
    commentedAt: m.comment.createdAt.toISOString(),
  }));
}

export async function getUnreadMentionCount() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  return prisma.taskCommentMention.count({
    where: { userId: user.id, readAt: null },
  });
}

export async function markMentionsReadBulk(mentionIds: string[]) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  await prisma.taskCommentMention.updateMany({
    where: { id: { in: mentionIds }, userId: user.id },
    data: { readAt: new Date() },
  });
}

export async function getClientDependencies() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const clientAnswers = await prisma.taskAnswer.findMany({
    where: {
      question: { type: "client" },
      task: {
        stage: { not: "DONE" },
        project: { ...whereClause, ...activeProjectFilter() },
      },
    },
    select: {
      answer: true,
      task: {
        select: {
          id: true,
          title: true,
          taskNumber: true,
          taskType: true,
          stage: true,
          priority: true,
          projectId: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
    take: 200,
  });

  const pending = clientAnswers
    .map((a) => {
      try {
        const parsed = JSON.parse(a.answer);
        if (parsed.needed && !parsed.completed) {
          return {
            task: a.task,
            note: (parsed.note as string) ?? "",
          };
        }
      } catch {}
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const byProject: Record<string, {
    project: { id: string; name: string };
    tasks: typeof pending;
  }> = {};

  for (const item of pending) {
    const pid = item.task.project.id;
    if (!byProject[pid]) {
      byProject[pid] = { project: item.task.project, tasks: [] };
    }
    byProject[pid].tasks.push(item);
  }

  return Object.values(byProject).sort((a, b) => b.tasks.length - a.tasks.length);
}

export async function getTeamProjects() {
  const { requireUser } = await import("@/lib/auth");
  await requireUser();

  const now = new Date();

  const [teams, unassignedProjects] = await Promise.all([
    prisma.team.findMany({
      where: { isDefault: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        projects: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            _count: { select: { tasks: true, members: true } },
            contracts: {
              where: { startDate: { not: null }, endDate: { not: null } },
              select: { startDate: true, endDate: true, latePayment: true, contractType: true },
              orderBy: { endDate: "desc" },
            },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { teamId: null },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        _count: { select: { tasks: true, members: true } },
        contracts: {
          where: { startDate: { not: null }, endDate: { not: null } },
          select: { startDate: true, endDate: true, latePayment: true, contractType: true },
          orderBy: { endDate: "desc" },
        },
      },
    }),
  ]);

  function mapProjects(raw: typeof unassignedProjects) {
    return raw.map((p) => {
      const activeContract = p.contracts.find(
        (c) => {
          if (!c.startDate || !c.endDate || c.latePayment) return false;
          const end = new Date(c.endDate);
          end.setHours(23, 59, 59, 999);
          return new Date(c.startDate) <= now && end >= now;
        }
      );
      return {
        id: p.id,
        name: p.name,
        logoUrl: p.logoUrl,
        taskCount: p._count.tasks,
        memberCount: p._count.members,
        isActive: !!activeContract,
        contractType: activeContract?.contractType ?? null,
      };
    });
  }

  const result = teams.map((team) => {
    const projects = mapProjects(team.projects);
    return {
      id: team.id,
      name: team.name,
      projectCount: projects.length,
      activeCount: projects.filter((p) => p.isActive).length,
      projects,
    };
  });

  if (unassignedProjects.length > 0) {
    const projects = mapProjects(unassignedProjects);
    result.push({
      id: "__none__",
      name: "No Team",
      projectCount: projects.length,
      activeCount: projects.filter((p) => p.isActive).length,
      projects,
    });
  }

  return result;
}

export async function getMyTasks() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      archivedAt: null,
      stage: { not: "DONE" },
      project: activeProjectFilter(),
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      stage: true,
      priority: true,
      projectId: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }],
    take: 50,
  });

  const byStage: Record<string, typeof tasks> = {};
  for (const t of tasks) {
    const stage = t.stage;
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(t);
  }

  const stageOrder = [
    "IN_DEVELOPMENT",
    "INTERNAL_REVIEW",
    "READY_FOR_DEV",
    "CLIENT_REVIEW",
    "READY_FOR_RELEASE",
    "NEW_REQUEST",
    "CLARIFICATION",
  ];

  const stages = stageOrder
    .filter((s) => byStage[s]?.length)
    .map((s) => ({
      stage: s,
      label: STAGE_LABELS[s] ?? s,
      tasks: byStage[s],
    }));

  return { total: tasks.length, stages };
}

export async function getDevQueue() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const memberProjectIds = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const projectIds = memberProjectIds.map((m) => m.projectId);
  if (projectIds.length === 0) return { total: 0, stages: [] };

  const [devTasks, clarTasks, mandatoryQuestions] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        archivedAt: null,
        stage: { in: ["READY_FOR_DEV", "IN_DEVELOPMENT"] },
        project: activeProjectFilter(),
      },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        taskType: true,
        stage: true,
        priority: true,
        projectId: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, imageUrl: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }],
      take: 100,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        archivedAt: null,
        stage: "CLARIFICATION",
        priority: { not: null },
        project: activeProjectFilter(),
      },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        taskType: true,
        stage: true,
        priority: true,
        projectId: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, imageUrl: true } },
        project: { select: { id: true, name: true } },
        answers: { select: { questionId: true, answer: true } },
      },
      orderBy: [{ priority: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }],
      take: 100,
    }),
    prisma.defaultQuestion.findMany({
      where: { mandatory: true },
      select: { id: true, taskType: true },
    }),
  ]);

  const readyClarTasks = clarTasks.filter((t) => {
    const reqIds = mandatoryQuestions
      .filter((q) => q.taskType === t.taskType)
      .map((q) => q.id);
    const answeredIds = new Set(
      t.answers.filter((a) => a.answer && a.answer.trim()).map((a) => a.questionId)
    );
    return reqIds.every((id) => answeredIds.has(id));
  }).map(({ answers, ...rest }) => rest);

  const allTasks = [...readyClarTasks, ...devTasks];

  const byStage: Record<string, typeof devTasks> = {};
  for (const t of allTasks) {
    if (!byStage[t.stage]) byStage[t.stage] = [];
    byStage[t.stage].push(t);
  }

  const stageOrder = ["CLARIFICATION", "READY_FOR_DEV", "IN_DEVELOPMENT"];
  const stages = stageOrder
    .filter((s) => byStage[s]?.length)
    .map((s) => ({
      stage: s,
      label: s === "CLARIFICATION" ? "Ready for Dev" : STAGE_LABELS[s] ?? s,
      tasks: byStage[s],
    }));

  return { total: allTasks.length, stages };
}

export async function getPmQueue() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const memberProjectIds = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const projectIds = memberProjectIds.map((m) => m.projectId);
  if (projectIds.length === 0) return { total: 0, stages: [] };

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      archivedAt: null,
      stage: "INTERNAL_REVIEW",
      project: activeProjectFilter(),
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      stage: true,
      priority: true,
      projectId: true,
      updatedAt: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: { sort: "desc", nulls: "last" } }, { updatedAt: "asc" }],
    take: 100,
  });

  return {
    total: tasks.length,
    stages: tasks.length > 0
      ? [{ stage: "INTERNAL_REVIEW", label: STAGE_LABELS["INTERNAL_REVIEW"] ?? "Internal Review", tasks }]
      : [],
  };
}

export async function markAllMentionsRead(projectId: string) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const taskIds = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
  });

  await prisma.taskCommentMention.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      comment: { taskId: { in: taskIds.map((t) => t.id) } },
    },
    data: { readAt: new Date() },
  });
}

const FUNNEL_STAGES = [
  "NEW_REQUEST", "SPEC_READY", "NEEDS_INPUT", "READY_FOR_DEV",
  "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE",
];

function funnelProjectFilter(systemRole: string, userId: string) {
  const wh = systemRole === "ADMIN"
    ? {}
    : systemRole === "PM" || systemRole === "TECH_LEAD"
      ? { OR: [{ members: { some: { userId } } }, { team: { members: { some: { userId } } } }] }
      : { members: { some: { userId } } };
  return { ...wh, ...activeProjectFilter() };
}

function buildRequiredByType(questions: { id: string; taskType: string }[]) {
  const m = new Map<string, string[]>();
  for (const q of questions) {
    const list = m.get(q.taskType) ?? [];
    list.push(q.id);
    m.set(q.taskType, list);
  }
  return m;
}

function computeBucket(
  stage: string,
  taskType: string,
  priority: number | null,
  answers: { questionId: string; answer: string }[],
  requiredByType: Map<string, string[]>,
) {
  if (stage !== "CLARIFICATION") return stage;
  const reqIds = requiredByType.get(taskType) ?? [];
  const answeredIds = new Set(answers.filter((a) => a.answer?.trim()).map((a) => a.questionId));
  return reqIds.every((id) => answeredIds.has(id)) && priority != null ? "SPEC_READY" : "NEEDS_INPUT";
}

export async function getStageFunnel() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const projectFilter = funnelProjectFilter(user.systemRole, user.id);

  const [nonClarGroups, clarTasks, requiredQuestions, projects] = await Promise.all([
    // Count non-clarification tasks in the DB instead of loading every row into JS.
    prisma.task.groupBy({
      by: ["projectId", "stage"],
      where: { archivedAt: null, stage: { not: "CLARIFICATION" }, project: projectFilter },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { archivedAt: null, stage: "CLARIFICATION", project: projectFilter },
      select: {
        taskType: true,
        priority: true,
        projectId: true,
        answers: { select: { questionId: true, answer: true } },
      },
    }),
    prisma.defaultQuestion.findMany({
      where: { required: true, type: { not: "client" } },
      select: { id: true, taskType: true },
    }),
    prisma.project.findMany({
      where: projectFilter,
      select: { id: true, name: true },
    }),
  ]);

  const requiredByType = buildRequiredByType(requiredQuestions);

  const projectMap: Record<string, string> = {};
  for (const p of projects) projectMap[p.id] = p.name;

  const byProject: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const s of FUNNEL_STAGES) totals[s] = 0;

  const ensureProject = (projectId: string) => {
    if (!byProject[projectId]) {
      byProject[projectId] = {};
      for (const s of FUNNEL_STAGES) byProject[projectId][s] = 0;
    }
  };

  let nonClarTotal = 0;
  for (const g of nonClarGroups) {
    const count = g._count._all;
    nonClarTotal += count;
    totals[g.stage] = (totals[g.stage] ?? 0) + count;
    ensureProject(g.projectId);
    byProject[g.projectId][g.stage] += count;
  }

  for (const t of clarTasks) {
    const bucket = computeBucket("CLARIFICATION", t.taskType, t.priority, t.answers, requiredByType);
    totals[bucket] = (totals[bucket] ?? 0) + 1;
    ensureProject(t.projectId);
    byProject[t.projectId][bucket]++;
  }

  return {
    stages: FUNNEL_STAGES,
    totals,
    byProject,
    projects: Object.entries(projectMap).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    totalTasks: nonClarTotal + clarTasks.length,
  };
}

export async function getFunnelTasks() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const [tasks, requiredQuestions] = await Promise.all([
    prisma.task.findMany({
      where: { archivedAt: null, project: funnelProjectFilter(user.systemRole, user.id) },
      select: {
        id: true, title: true, taskNumber: true, stage: true, taskType: true,
        priority: true, projectId: true, updatedAt: true,
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, imageUrl: true } },
        answers: { select: { questionId: true, answer: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    prisma.defaultQuestion.findMany({
      where: { required: true, type: { not: "client" } },
      select: { id: true, taskType: true },
    }),
  ]);

  const requiredByType = buildRequiredByType(requiredQuestions);

  return tasks.map((t) => ({
    id: t.id, title: t.title, taskNumber: t.taskNumber, taskType: t.taskType,
    stage: t.stage, bucket: computeBucket(t.stage, t.taskType, t.priority, t.answers, requiredByType),
    priority: t.priority, projectId: t.projectId, updatedAt: t.updatedAt.toISOString(),
    project: t.project, assignee: t.assignee,
  }));
}

const STAGE_LABELS_MAP: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

export async function getTasksNeedingClientInput(assigneeId?: string) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();
  const now = new Date();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const answers = await prisma.taskAnswer.findMany({
    where: {
      question: { type: "client" },
      task: {
        stage: { in: ["NEW_REQUEST", "CLARIFICATION"] },
        archivedAt: null,
        project: { ...whereClause, ...activeProjectFilter() },
        ...(assigneeId ? { assigneeId } : {}),
        ...taskVisibilityFilter(user),
      },
    },
    select: {
      answer: true,
      task: {
        select: {
          id: true,
          title: true,
          taskNumber: true,
          taskType: true,
          stage: true,
          priority: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, imageUrl: true } },
          stageLogs: {
            where: { exitedAt: null },
            orderBy: { enteredAt: "desc" as const },
            take: 1,
            select: { enteredAt: true },
          },
        },
      },
    },
  });

  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  return answers
    .map((a) => {
      try {
        const parsed = JSON.parse(a.answer);
        if (!parsed.needed || parsed.completed) return null;
        const stageLog = a.task.stageLogs[0];
        const waitingMs = stageLog
          ? now.getTime() - new Date(stageLog.enteredAt).getTime()
          : 0;
        return {
          id: a.task.id,
          title: a.task.title,
          taskNumber: a.task.taskNumber,
          taskType: a.task.taskType,
          stage: a.task.stage,
          stageLabel: STAGE_LABELS_MAP[a.task.stage] ?? a.task.stage,
          priority: a.task.priority,
          assignee: a.task.assignee,
          project: a.task.project,
          note: (parsed.note as string) ?? "",
          waitingMs,
        };
      } catch { return null; }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null && t.waitingMs >= TWO_DAYS_MS)
    .sort((a, b) => b.waitingMs - a.waitingMs);
}

// "What's next" across all projects: for every active project the user can
// see, the top-priority Clarification task that is ready to move (all required
// non-client questions answered, priority set, not waiting on client input) —
// the same rule as the board's "Up Next" slot.
export async function getUpNextByProject() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const [tasks, requiredQuestions] = await Promise.all([
    prisma.task.findMany({
      where: {
        stage: "CLARIFICATION",
        archivedAt: null,
        project: { ...whereClause, ...activeProjectFilter() },
        ...taskVisibilityFilter(user),
      },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        taskType: true,
        priority: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, imageUrl: true } },
        project: { select: { id: true, name: true, logoUrl: true } },
        answers: {
          select: {
            questionId: true,
            answer: true,
            question: { select: { type: true } },
          },
        },
      },
      take: 1000,
    }),
    prisma.defaultQuestion.findMany({
      where: { required: true, type: { not: "client" } },
      select: { id: true, taskType: true },
    }),
  ]);

  const requiredByType = buildRequiredByType(requiredQuestions);

  const ready = tasks.filter((t) => {
    const reqIds = requiredByType.get(t.taskType) ?? [];
    const answeredIds = new Set(
      t.answers.filter((a) => a.answer && a.answer.trim()).map((a) => a.questionId),
    );
    const hasAllRequired = reqIds.every((id) => answeredIds.has(id)) && t.priority != null;
    if (!hasAllRequired) return false;

    const waitingOnClient = t.answers.some((a) => {
      if (a.question.type !== "client") return false;
      try {
        const parsed = JSON.parse(a.answer);
        return parsed.needed === true && !parsed.completed;
      } catch {
        return false;
      }
    });
    return !waitingOnClient;
  });

  const byProject = new Map<string, typeof ready>();
  for (const t of ready) {
    const list = byProject.get(t.project.id) ?? [];
    list.push(t);
    byProject.set(t.project.id, list);
  }

  // Only the single Up Next task per project — same as the board, which
  // surfaces exactly one task in the Up Next slot (MAX_UP_NEXT = 1).
  return [...byProject.values()]
    .map((list) => {
      const top = list.sort(
        (a, b) =>
          (b.priority ?? 0) - (a.priority ?? 0) ||
          a.updatedAt.getTime() - b.updatedAt.getTime(),
      )[0];
      return {
        project: top.project,
        task: {
          id: top.id,
          title: top.title,
          taskNumber: top.taskNumber,
          taskType: top.taskType,
          priority: top.priority,
          assignee: top.assignee,
        },
      };
    })
    .sort(
      (a, b) =>
        (b.task.priority ?? 0) - (a.task.priority ?? 0) ||
        a.project.name.localeCompare(b.project.name),
    );
}

/**
 * "Awaiting Development" card on the Dashboard tab: every open task sitting in
 * Clarification or Ready for Dev (i.e. cleared intake but not yet picked up by
 * development) across the projects the viewer can access. `mine` counts the
 * ones the viewer is responsible for (assignee or sticky developer).
 */
export async function getAwaitingDevelopment() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const AWAITING_STAGES = ["CLARIFICATION", "READY_FOR_DEV"];

  const whereClause = user.systemRole === "ADMIN"
    ? {}
    : user.systemRole === "PM" || user.systemRole === "TECH_LEAD"
      ? {
          OR: [
            { members: { some: { userId: user.id } } },
            { team: { members: { some: { userId: user.id } } } },
          ],
        }
      : { members: { some: { userId: user.id } } };

  const tasks = await prisma.task.findMany({
    where: {
      stage: { in: AWAITING_STAGES as any },
      archivedAt: null,
      project: { ...whereClause, ...activeProjectFilter() },
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      stage: true,
      priority: true,
      assigneeId: true,
      developerId: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ stage: "asc" }, { updatedAt: "asc" }],
    take: 300,
  });

  const stageLogs = tasks.length > 0
    ? await prisma.stageLog.findMany({
        where: { taskId: { in: tasks.map((t) => t.id) }, exitedAt: null },
        select: { taskId: true, enteredAt: true },
      })
    : [];
  const enteredMap = new Map(stageLogs.map((l) => [l.taskId, l.enteredAt]));

  const items = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    taskNumber: t.taskNumber,
    taskType: t.taskType,
    stage: t.stage,
    stageLabel: STAGE_LABELS[t.stage] ?? t.stage,
    priority: t.priority,
    mine: t.assigneeId === user.id || t.developerId === user.id,
    enteredAt: enteredMap.get(t.id) ?? null,
    assignee: t.assignee,
    project: t.project,
  }));

  return {
    mine: items.filter((t) => t.mine).length,
    total: items.length,
    tasks: items,
  };
}

/**
 * "My Supervision" card on the Dashboard tab: the projects where the viewer's
 * project role is flagged Team Lead (ProjectRole.isTeamLead).
 */
export async function getSupervisedProjects() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id, projectRole: { is: { isTeamLead: true } }, project: activeProjectFilter() },
    select: {
      project: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              members: true,
              tasks: { where: { archivedAt: null, stage: { not: "DONE" } } },
            },
          },
        },
      },
    },
    orderBy: { project: { name: "asc" } },
  });

  return memberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    memberCount: m.project._count.members,
    openTasks: m.project._count.tasks,
  }));
}

export async function getClientInputByAssignee() {
  const tasks = await getTasksNeedingClientInput();

  const byAssignee: Record<string, {
    assignee: { id: string; name: string | null; imageUrl: string | null };
    taskCount: number;
    longestMs: number;
  }> = {};

  for (const t of tasks) {
    if (!t.assignee) continue;
    const uid = t.assignee.id;
    if (!byAssignee[uid]) {
      byAssignee[uid] = { assignee: t.assignee, taskCount: 0, longestMs: 0 };
    }
    byAssignee[uid].taskCount += 1;
    if (t.waitingMs > byAssignee[uid].longestMs) {
      byAssignee[uid].longestMs = t.waitingMs;
    }
  }

  return Object.values(byAssignee).sort((a, b) => b.taskCount - a.taskCount);
}
