"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";

export async function getDashboardData(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);

  const [tasks, project, mentions] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
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
      where: { userId: user.id },
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
      return new Date(c.startDate) <= now && new Date(c.endDate) >= now;
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

  // Mentions
  const mentionsList = mentions
    .filter((m) => m.comment.task.projectId === projectId)
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

export async function getLongestInPipeline() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();

  const now = new Date();

  const activeStages = [
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
      project: whereClause,
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

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  return tasks
    .map((t) => {
      const pipelineMs = now.getTime() - new Date(t.startedAt!).getTime();
      if (pipelineMs < ONE_DAY_MS) return null;
      const log = stageLogMap.get(t.id);
      const stageMs = log ? now.getTime() - new Date(log.enteredAt).getTime() : 0;

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
        pipelineMs,
        stageMs,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => b.pipelineMs - a.pipelineMs);
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
      project: whereClause,
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
      task: { stage: { not: "DONE" }, project: whereClause },
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

  return Object.values(byTask).sort((a, b) => b.totalCount - a.totalCount);
}

export async function markMentionRead(mentionId: string) {
  await prisma.taskCommentMention.update({
    where: { id: mentionId },
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
      (c) => c.startDate && c.endDate && new Date(c.startDate) <= now && new Date(c.endDate) >= now
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
  await prisma.taskCommentMention.updateMany({
    where: { id: { in: mentionIds } },
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
        project: whereClause,
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
        (c) => c.startDate && c.endDate && new Date(c.startDate) <= now && new Date(c.endDate) >= now && !c.latePayment
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

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      archivedAt: null,
      stage: { in: ["READY_FOR_DEV", "IN_DEVELOPMENT"] },
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

  const byStage: Record<string, typeof tasks> = {};
  for (const t of tasks) {
    if (!byStage[t.stage]) byStage[t.stage] = [];
    byStage[t.stage].push(t);
  }

  const stageOrder = ["READY_FOR_DEV", "IN_DEVELOPMENT"];
  const stages = stageOrder
    .filter((s) => byStage[s]?.length)
    .map((s) => ({ stage: s, label: STAGE_LABELS[s] ?? s, tasks: byStage[s] }));

  return { total: tasks.length, stages };
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

export async function markAllMentionsRead(projectId: string, userId: string) {
  const taskIds = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
  });

  await prisma.taskCommentMention.updateMany({
    where: {
      userId,
      readAt: null,
      comment: { taskId: { in: taskIds.map((t) => t.id) } },
    },
    data: { readAt: new Date() },
  });
}
