"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logTaskActivity } from "@/lib/activity";
import {
  getPermissionsFromRole,
  getAdminPermissions,
  canTransition,
  canCreateInStage,
  canModifyInStage,
} from "@/lib/permissions";
import { broadcastTaskEvent } from "@/lib/pusher";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";

export async function createTask(data: {
  projectId: string;
  title: string;
  description?: string;
  priority?: number;
  taskType?: "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  assigneeId?: string;
  answers?: { questionId: string; answer: string }[];
}) {
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    include: { contracts: true },
  });
  if (!project) throw new Error("Project not found");

  const activeContract = getActiveContract(project.contracts);
  if (!activeContract) throw new Error("No active contract — this project is read-only");

  const { user, member } = await requireProjectMember(project.id);
  const isAdmin = user.systemRole === "ADMIN";

  if (!isAdmin) {
    const perms = getPermissionsFromRole(member.projectRole);
    if (!canCreateInStage(perms, "NEW_REQUEST")) {
      throw new Error("You do not have permission to create tasks");
    }
  }

  const taskType = data.taskType ?? "FEATURE";
  const allowedTypes = getAllowedTaskTypes(activeContract.contractType, isAdmin);
  if (!allowedTypes.includes(taskType)) {
    throw new Error(`Cannot create "${taskType}" tasks under a ${activeContract.contractType.replace(/_/g, " ")} contract`);
  }

  const [maxOrder, maxTaskNumber] = await Promise.all([
    prisma.task.aggregate({
      where: { projectId: data.projectId, stage: "NEW_REQUEST" },
      _max: { order: true },
    }),
    prisma.task.aggregate({
      where: { projectId: data.projectId },
      _max: { taskNumber: true },
    }),
  ]);
  const mandatoryQuestions = await prisma.defaultQuestion.findMany({
    where: { taskType, mandatory: true },
    select: { id: true, question: true },
  });

  if (mandatoryQuestions.length > 0) {
    const answeredMap = new Map(
      (data.answers ?? []).map((a) => [a.questionId, a.answer])
    );
    const unanswered = mandatoryQuestions.filter((q) => {
      const answer = answeredMap.get(q.id);
      return !answer || !answer.trim();
    });
    if (unanswered.length > 0) {
      throw new Error(
        `MANDATORY_QUESTIONS:${JSON.stringify(unanswered.map((q) => q.question))}`
      );
    }
  }

  const priority = data.priority != null ? Math.min(10, Math.max(1, data.priority)) : null;

  const task = await prisma.task.create({
    data: {
      taskNumber: (maxTaskNumber._max.taskNumber ?? 0) + 1,
      title: data.title,
      description: data.description,
      priority,
      taskType,
      stage: "NEW_REQUEST",
      order: (maxOrder._max.order ?? 0) + 1,
      projectId: data.projectId,
      createdById: user.id,
      assigneeId: data.assigneeId,
      ...(data.answers?.length && {
        answers: {
          create: data.answers
            .filter((a) => a.answer.trim())
            .map((a) => ({ questionId: a.questionId, answer: a.answer })),
        },
      }),
    },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "created",
    newValue: task.title,
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  broadcastTaskEvent(data.projectId, { type: "task-created", taskId: task.id, userId: user.id });
  return task;
}

export async function updateTask(data: {
  taskId: string;
  title?: string;
  description?: string;
  priority?: number | null;
  assigneeId?: string | null;
}) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: { project: { include: { contracts: true } }, assignee: true },
  });
  if (!task) throw new Error("Task not found");

  const activeContract = getActiveContract(task.project.contracts);
  if (!activeContract) throw new Error("No active contract — this project is read-only");

  const { user, member } = await requireProjectMember(task.projectId);
  if (user.systemRole !== "ADMIN") {
    const perms = getPermissionsFromRole(member.projectRole);
    if (!canModifyInStage(perms, task.stage)) {
      throw new Error("You do not have permission to modify tasks in this stage");
    }
  }

  const activities: Promise<unknown>[] = [];

  if (data.title && data.title !== task.title) {
    activities.push(logTaskActivity({
      taskId: task.id, userId: user.id, action: "updated",
      field: "title", oldValue: task.title, newValue: data.title,
    }));
  }
  if (data.priority !== undefined && data.priority !== task.priority) {
    activities.push(logTaskActivity({
      taskId: task.id, userId: user.id, action: "updated",
      field: "priority", oldValue: String(task.priority), newValue: String(data.priority),
    }));
  }
  if (data.assigneeId !== undefined && data.assigneeId !== task.assigneeId) {
    if (data.assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
      activities.push(logTaskActivity({
        taskId: task.id, userId: user.id, action: "assigned",
        field: "assignee", oldValue: task.assignee?.name, newValue: newAssignee?.name,
      }));
    } else {
      activities.push(logTaskActivity({
        taskId: task.id, userId: user.id, action: "unassigned",
        field: "assignee", oldValue: task.assignee?.name,
      }));
    }
  }

  const updated = await prisma.task.update({
    where: { id: data.taskId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority != null ? Math.min(10, Math.max(1, data.priority)) : null }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
    },
  });

  await Promise.all(activities);

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-updated", taskId: data.taskId, userId: user.id });
  return updated;
}

export async function moveTask(data: {
  taskId: string;
  stage: "NEW_REQUEST" | "CLARIFICATION" | "READY_FOR_DEV" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "READY_FOR_RELEASE" | "DONE";
  order: number;
  estimatedMinutes?: number;
}) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: { project: { include: { contracts: true } } },
  });
  if (!task) throw new Error("Task not found");

  const activeContract = getActiveContract(task.project.contracts);
  if (!activeContract) throw new Error("No active contract — this project is read-only");

  const { user, member } = await requireProjectMember(task.projectId);

  if (user.systemRole !== "ADMIN" && task.stage !== data.stage) {
    const perms = getPermissionsFromRole(member.projectRole);
    if (!canTransition(perms, task.stage, data.stage)) {
      throw new Error(`Your role cannot move tasks from ${task.stage.replaceAll("_", " ")} to ${data.stage.replaceAll("_", " ")}`);
    }
  }

  const oldStage = task.stage;

  if (oldStage === "CLARIFICATION" && data.stage !== "CLARIFICATION" && data.stage !== "NEW_REQUEST") {
    const errors: string[] = [];

    if (task.priority == null) {
      errors.push("Priority must be set");
    }

    const requiredQuestions = await prisma.defaultQuestion.findMany({
      where: { taskType: task.taskType, required: true, type: { not: "client" } },
      select: { id: true, question: true },
    });

    if (requiredQuestions.length > 0) {
      const existingAnswers = await prisma.taskAnswer.findMany({
        where: { taskId: task.id, questionId: { in: requiredQuestions.map((q) => q.id) } },
        select: { questionId: true, answer: true },
      });

      const answeredMap = new Map(existingAnswers.map((a) => [a.questionId, a.answer]));
      const unanswered = requiredQuestions.filter((q) => {
        const answer = answeredMap.get(q.id);
        return !answer || !answer.trim();
      });

      errors.push(...unanswered.map((q) => q.question));
    }

    if (errors.length > 0) {
      throw new Error(`REQUIRED_QUESTIONS:${JSON.stringify(errors)}`);
    }

    if (task.priority != null) {
      const higherPriorityTasks = await prisma.task.findMany({
        where: {
          projectId: task.projectId,
          stage: "CLARIFICATION",
          id: { not: task.id },
          priority: { gt: task.priority },
        },
        select: { taskNumber: true, title: true, priority: true, taskType: true },
        orderBy: { priority: "desc" },
      });

      if (higherPriorityTasks.length > 0) {
        const blockingList = higherPriorityTasks.map((t) => {
          const prefix = t.taskType === "BUG" ? "B" : t.taskType === "REPORTED_BUG" ? "RB" : t.taskType === "ENHANCEMENT" ? "E" : t.taskType === "DESIGN" ? "D" : "F";
          return `${prefix}-${String(t.taskNumber).padStart(3, "0")} (P${t.priority}): ${t.title}`;
        });
        throw new Error(`PRIORITY_BLOCKED:${JSON.stringify(blockingList)}`);
      }
    }
  }

  let targetStage = data.stage;
  if (task.taskType === "BUG" && targetStage === "CLIENT_REVIEW") {
    targetStage = "READY_FOR_RELEASE";
  }

  const isEnteringDev = oldStage !== "READY_FOR_DEV" && targetStage === "READY_FOR_DEV";

  if (isEnteringDev && !task.estimatedMinutes && !data.estimatedMinutes) {
    throw new Error("ESTIMATE_REQUIRED");
  }

  let estimateAccuracy: "WAY_OVER" | "OVER" | "ON_TRACK" | "UNDER" | "WAY_UNDER" | undefined;
  if (targetStage === "DONE" && oldStage !== "DONE" && task.startedAt && task.estimatedMinutes) {
    const actualMs = Date.now() - task.startedAt.getTime();
    const actualMinutes = actualMs / 60_000;
    const ratio = actualMinutes / task.estimatedMinutes;
    if (ratio > 2.0) estimateAccuracy = "WAY_OVER";
    else if (ratio > 1.25) estimateAccuracy = "OVER";
    else if (ratio >= 0.75) estimateAccuracy = "ON_TRACK";
    else if (ratio >= 0.5) estimateAccuracy = "UNDER";
    else estimateAccuracy = "WAY_UNDER";
  }

  const updated = await prisma.task.update({
    where: { id: data.taskId },
    data: {
      stage: targetStage,
      order: data.order,
      ...(isEnteringDev && !task.startedAt && { startedAt: new Date() }),
      ...(isEnteringDev && data.estimatedMinutes && { estimatedMinutes: data.estimatedMinutes }),
      ...(estimateAccuracy && { estimateAccuracy }),
    },
  });

  if (oldStage !== targetStage) {
    await prisma.stageLog.updateMany({
      where: { taskId: task.id, stage: oldStage, exitedAt: null },
      data: { exitedAt: new Date() },
    });

    await prisma.stageLog.create({
      data: { taskId: task.id, stage: targetStage },
    });

    await logTaskActivity({
      taskId: task.id,
      userId: user.id,
      action: "moved",
      field: "stage",
      oldValue: oldStage,
      newValue: targetStage,
    });
  }

  broadcastTaskEvent(task.projectId, {
    type: "task-moved",
    taskId: data.taskId,
    stage: updated.stage,
    order: updated.order,
    userId: user.id,
  });
  return updated;
}

const DECLINE_TARGETS: Record<string, "NEW_REQUEST" | "CLARIFICATION" | "READY_FOR_DEV" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "READY_FOR_RELEASE" | "DONE"> = {
  INTERNAL_REVIEW: "IN_DEVELOPMENT",
  CLIENT_REVIEW: "INTERNAL_REVIEW",
};

export async function declineTask(data: {
  taskId: string;
  comment: string;
}) {
  if (!data.comment.trim()) {
    throw new Error("A comment explaining the reason is required when declining a task");
  }

  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: { id: true, stage: true, projectId: true, order: true },
  });
  if (!task) throw new Error("Task not found");

  const targetStage = DECLINE_TARGETS[task.stage];
  if (!targetStage) {
    throw new Error("This task cannot be declined from its current stage");
  }

  const { user, member } = await requireProjectMember(task.projectId);

  if (user.systemRole !== "ADMIN") {
    const perms = getPermissionsFromRole(member.projectRole);
    if (!perms.isAdmin && !perms.canDeclineTask) {
      throw new Error("You do not have permission to decline tasks");
    }
  }

  await prisma.taskComment.create({
    data: {
      content: `⚠️ **Declined from ${task.stage.replaceAll("_", " ")}**: ${data.comment}`,
      taskId: task.id,
      userId: user.id,
    },
  });

  const oldStage = task.stage;
  const tasksInTarget = await prisma.task.count({
    where: { projectId: task.projectId, stage: targetStage },
  });

  await prisma.task.update({
    where: { id: task.id },
    data: { stage: targetStage, order: tasksInTarget },
  });

  await prisma.stageLog.updateMany({
    where: { taskId: task.id, stage: oldStage, exitedAt: null },
    data: { exitedAt: new Date() },
  });

  await prisma.stageLog.create({
    data: { taskId: task.id, stage: targetStage },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "declined",
    field: "stage",
    oldValue: oldStage,
    newValue: targetStage,
  });

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-declined", taskId: task.id, userId: user.id });
}

export async function deleteTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!task) throw new Error("Task not found");

  const { user, member } = await requireProjectMember(task.projectId);
  if (user.systemRole !== "ADMIN") {
    const perms = getPermissionsFromRole(member.projectRole);
    if (!perms.isAdmin && !perms.canDeleteTask) {
      throw new Error("You do not have permission to delete tasks");
    }
  }

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-deleted", taskId, userId: user.id });
}

export async function getTasksByProject(projectId: string) {
  await requireProjectMember(projectId);

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignee: true,
      createdBy: true,
      answers: { select: { questionId: true, answer: true } },
      stageLogs: {
        where: { exitedAt: null },
        orderBy: { enteredAt: "desc" },
        take: 1,
        select: { enteredAt: true },
      },
      _count: { select: { notes: true } },
    },
    orderBy: { order: "asc" },
  });

  const [requiredQuestions, declineCounts] = await Promise.all([
    prisma.defaultQuestion.findMany({
      where: { required: true },
      select: { id: true, taskType: true, type: true },
    }),
    prisma.taskActivity.findMany({
      where: { action: "declined", task: { projectId } },
      select: { taskId: true, oldValue: true },
    }),
  ]);

  const declinesByTask = new Map<string, { internal: number; client: number }>();
  for (const d of declineCounts) {
    const entry = declinesByTask.get(d.taskId) ?? { internal: 0, client: 0 };
    if (d.oldValue === "CLIENT_REVIEW") {
      entry.client += 1;
    } else {
      entry.internal += 1;
    }
    declinesByTask.set(d.taskId, entry);
  }

  const requiredByType = new Map<string, string[]>();
  for (const q of requiredQuestions) {
    if (q.type === "client") continue;
    const list = requiredByType.get(q.taskType) ?? [];
    list.push(q.id);
    requiredByType.set(q.taskType, list);
  }

  return tasks.map((task) => {
    const reqIds = requiredByType.get(task.taskType) ?? [];
    const answeredIds = new Set(
      task.answers.filter((a) => a.answer && a.answer.trim()).map((a) => a.questionId)
    );
    const isReadyForTransition = reqIds.every((id) => answeredIds.has(id)) && task.priority != null;

    const currentLog = task.stageLogs[0];
    return {
      ...task,
      answers: undefined,
      stageLogs: undefined,
      isReadyForTransition,
      startedAt: task.startedAt?.toISOString() ?? null,
      stageEnteredAt: currentLog?.enteredAt?.toISOString() ?? null,
      declineCount: (declinesByTask.get(task.id)?.internal ?? 0) + (declinesByTask.get(task.id)?.client ?? 0),
      internalDeclines: declinesByTask.get(task.id)?.internal ?? 0,
      clientDeclines: declinesByTask.get(task.id)?.client ?? 0,
      estimatedMinutes: task.estimatedMinutes,
      estimateAccuracy: task.estimateAccuracy,
      notesCount: task._count.notes,
    };
  });
}

export async function pollTaskUpdates(projectId: string) {
  await requireProjectMember(projectId);

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      stage: true,
      order: true,
      title: true,
      priority: true,
      taskType: true,
      taskNumber: true,
      estimatedMinutes: true,
      estimateAccuracy: true,
      startedAt: true,
      assignee: { select: { id: true, name: true, email: true, imageUrl: true } },
      createdBy: { select: { id: true, name: true, email: true, imageUrl: true } },
      stageLogs: {
        where: { exitedAt: null },
        orderBy: { enteredAt: "desc" },
        take: 1,
        select: { enteredAt: true },
      },
    },
    orderBy: { order: "asc" },
  });

  return tasks.map((t) => ({
    id: t.id,
    stage: t.stage,
    order: t.order,
    title: t.title,
    priority: t.priority,
    taskType: t.taskType,
    taskNumber: t.taskNumber,
    estimatedMinutes: t.estimatedMinutes,
    estimateAccuracy: t.estimateAccuracy,
    startedAt: t.startedAt?.toISOString() ?? null,
    stageEnteredAt: t.stageLogs[0]?.enteredAt?.toISOString() ?? null,
    assignee: t.assignee,
    createdBy: t.createdBy,
  }));
}

export async function getTaskStageLogs(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { startedAt: true, projectId: true },
  });
  if (!task) throw new Error("Task not found");
  await requireProjectMember(task.projectId);

  const logs = await prisma.stageLog.findMany({
    where: { taskId },
    orderBy: { enteredAt: "asc" },
  });

  return { startedAt: task.startedAt, logs };
}
