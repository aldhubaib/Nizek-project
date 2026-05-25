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

export async function markMentionRead(mentionId: string) {
  await prisma.taskCommentMention.update({
    where: { id: mentionId },
    data: { readAt: new Date() },
  });
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
