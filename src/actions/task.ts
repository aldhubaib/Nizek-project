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
import { publish, broadcast, broadcastTaskEvent, taskChannel, projectChannel, userChannel } from "@/lib/centrifugo";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { sendPush } from "@/lib/push";

// ─── Stage → Role Track ─────────────────────────────────
type RoleTrack = "pm" | "developer" | "client";

const STAGE_ROLE_MAP: Record<string, RoleTrack> = {
  NEW_REQUEST: "pm",
  CLARIFICATION: "pm",
  READY_FOR_DEV: "developer",
  IN_DEVELOPMENT: "developer",
  INTERNAL_REVIEW: "pm",
  CLIENT_REVIEW: "client",
  READY_FOR_RELEASE: "developer",
  DONE: "developer",
};

const PM_ROLES = ["ADMIN", "PM", "TECH_LEAD"];
const DEV_ROLES = ["DEVELOPER", "DESIGNER", "TECH_LEAD", "ADMIN"];
const CLIENT_ROLES = ["CLIENT"];

const ALLOWED_ROLES_BY_TRACK: Record<RoleTrack, string[]> = {
  pm: PM_ROLES,
  developer: DEV_ROLES,
  client: CLIENT_ROLES,
};

async function resolveAutoAssignee(
  stage: string,
  task: { createdById: string; developerId: string | null; clientReviewerId: string | null },
  actingUserId: string,
  projectId: string,
): Promise<string | null> {
  const track = STAGE_ROLE_MAP[stage];
  if (!track) return null;

  switch (track) {
    case "pm":
      return task.createdById;
    case "developer":
      return task.developerId ?? actingUserId;
    case "client": {
      if (task.clientReviewerId) return task.clientReviewerId;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { defaultClientReviewerId: true },
      });
      if (project?.defaultClientReviewerId) return project.defaultClientReviewerId;
      const clientMember = await prisma.projectMember.findFirst({
        where: { projectId, role: "CLIENT" },
        select: { userId: true },
      });
      return clientMember?.userId ?? null;
    }
  }
}

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
      where: { projectId: data.projectId, stage: "NEW_REQUEST", archivedAt: null },
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
      assigneeId: data.assigneeId ?? user.id,
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
  const stickyUpdates: Record<string, string | null> = {};
  if (data.assigneeId !== undefined && data.assigneeId !== task.assigneeId) {
    if (data.assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: data.assigneeId }, select: { id: true, name: true, systemRole: true } });
      if (!newAssignee) throw new Error("User not found");

      if (user.systemRole !== "ADMIN") {
        const track = STAGE_ROLE_MAP[task.stage];
        const allowedRoles = track ? ALLOWED_ROLES_BY_TRACK[track] : [];
        if (allowedRoles.length > 0 && !allowedRoles.includes(newAssignee.systemRole)) {
          throw new Error(`Cannot assign a ${newAssignee.systemRole} in ${task.stage.replaceAll("_", " ")} stage`);
        }
      }

      const track = STAGE_ROLE_MAP[task.stage];
      if (track === "developer") stickyUpdates.developerId = data.assigneeId;
      if (track === "client") stickyUpdates.clientReviewerId = data.assigneeId;

      activities.push(logTaskActivity({
        taskId: task.id, userId: user.id, action: "assigned",
        field: "assignee", oldValue: task.assignee?.name, newValue: newAssignee.name,
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
      ...stickyUpdates,
    },
  });

  await Promise.all(activities);

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-updated", taskId: data.taskId, userId: user.id });
  return updated;
}

/**
 * Claim a task by assigning it to the current user. Offered on the board when
 * the viewer clicks a task's avatar and holds the right to move that task at its
 * current stage (admins always qualify). The server re-checks the permission.
 */
export async function assignTaskToMe(
  taskId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { contracts: true } } },
    });
    if (!task) return { success: false, error: "Task not found" };

    const { user, member } = await requireProjectMember(task.projectId);
    const isAdmin = user.systemRole === "ADMIN";

    const activeContract = getActiveContract(task.project.contracts);
    if (!activeContract && !isAdmin) {
      return { success: false, error: "No active contract — this project is read-only" };
    }

    if (!isAdmin) {
      const perms = getPermissionsFromRole(member.projectRole);
      const canMoveAtStage =
        perms.canMoveTask && (perms.allowedTransitions[task.stage]?.length ?? 0) > 0;
      if (!canMoveAtStage) {
        return { success: false, error: "You don't have permission to assign tasks at this stage" };
      }
    }

    if (task.assigneeId === user.id) return { success: true };

    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: user.id },
    });

    await logTaskActivity({
      taskId,
      userId: user.id,
      action: "updated",
      field: "assignee",
      newValue: user.name ?? null,
    });

    revalidatePath(`/dashboard/projects/${task.projectId}`);
    broadcastTaskEvent(task.projectId, { type: "task-updated", taskId, userId: user.id });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign task",
    };
  }
}

export async function moveTask(data: {
  taskId: string;
  stage: "NEW_REQUEST" | "CLARIFICATION" | "READY_FOR_DEV" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "READY_FOR_RELEASE" | "DONE";
  order: number;
  estimatedMinutes?: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      include: { project: { include: { contracts: true } } },
    });
    if (!task) return { success: false, error: "Task not found" };

    const { user, member } = await requireProjectMember(task.projectId);
    const isAdmin = user.systemRole === "ADMIN";

    const activeContract = getActiveContract(task.project.contracts);
    if (!activeContract && !isAdmin) return { success: false, error: "No active contract — this project is read-only" };

    if (!isAdmin && task.stage !== data.stage) {
      const perms = getPermissionsFromRole(member.projectRole);
      if (!canTransition(perms, task.stage, data.stage)) {
        return { success: false, error: `Your role cannot move tasks from ${task.stage.replaceAll("_", " ")} to ${data.stage.replaceAll("_", " ")}` };
      }
    }

    const oldStage = task.stage;

    if (!isAdmin && oldStage === "CLARIFICATION" && data.stage !== "CLARIFICATION" && data.stage !== "NEW_REQUEST") {
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

      const clientAnswers = await prisma.taskAnswer.findMany({
        where: {
          taskId: task.id,
          question: { type: "client" },
        },
        select: { answer: true },
      });
      for (const ca of clientAnswers) {
        try {
          const parsed = JSON.parse(ca.answer);
          if (parsed.needed === true && !parsed.completed) {
            errors.push("Waiting on client — cannot move until client dependency is resolved");
            break;
          }
        } catch {}
      }

      if (errors.length > 0) {
        return { success: false, error: `REQUIRED_QUESTIONS:${JSON.stringify(errors)}` };
      }

      if (task.priority != null) {
        const higherPriorityTasks = await prisma.task.findMany({
          where: {
            projectId: task.projectId,
            stage: "CLARIFICATION",
            id: { not: task.id },
            priority: { gt: task.priority },
            archivedAt: null,
          },
          select: { taskNumber: true, title: true, priority: true, taskType: true },
          orderBy: { priority: "desc" },
        });

        if (higherPriorityTasks.length > 0) {
          const blockingList = higherPriorityTasks.map((t) => {
            const prefix = t.taskType === "BUG" ? "B" : t.taskType === "REPORTED_BUG" ? "RB" : t.taskType === "ENHANCEMENT" ? "E" : t.taskType === "DESIGN" ? "D" : "F";
            return `${prefix}-${String(t.taskNumber).padStart(3, "0")} (P${t.priority}): ${t.title}`;
          });
          return { success: false, error: `PRIORITY_BLOCKED:${JSON.stringify(blockingList)}` };
        }
      }
    }

    let targetStage = data.stage;
    if (!isAdmin && task.taskType === "BUG" && targetStage === "CLIENT_REVIEW") {
      targetStage = "READY_FOR_RELEASE";
    }

    // Pipeline WIP limit: block bringing a new task into the active pipeline
    // (Ready for Dev, In Development, Internal Review) when it's already full.
    // Moves within the pipeline, moves out of it, and declines back into it are
    // never blocked — only fresh entries from an earlier stage count.
    const PIPELINE_STAGES = ["READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW"];
    const STAGE_SEQUENCE = ["NEW_REQUEST", "CLARIFICATION", "READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE"];
    const isEnteringPipeline =
      PIPELINE_STAGES.includes(targetStage) &&
      !PIPELINE_STAGES.includes(oldStage) &&
      STAGE_SEQUENCE.indexOf(oldStage) < STAGE_SEQUENCE.indexOf("READY_FOR_DEV");

    if (isEnteringPipeline) {
      const maxPipelineTasks = task.project.maxPipelineTasks ?? 3;
      const pipelineCount = await prisma.task.count({
        where: {
          projectId: task.projectId,
          stage: { in: PIPELINE_STAGES as any },
          archivedAt: null,
        },
      });
      if (pipelineCount >= maxPipelineTasks) {
        return { success: false, error: `WIP_LIMIT:${maxPipelineTasks}` };
      }
    }

    const isEnteringDev = oldStage !== "READY_FOR_DEV" && targetStage === "READY_FOR_DEV";

    if (!isAdmin && isEnteringDev && !task.estimatedMinutes && !data.estimatedMinutes) {
      return { success: false, error: "ESTIMATE_REQUIRED" };
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

    let autoAssigneeId: string | null | undefined;
    const stickyUpdates: Record<string, string> = {};
    if (oldStage !== targetStage) {
      autoAssigneeId = await resolveAutoAssignee(
        targetStage,
        { createdById: task.createdById, developerId: task.developerId, clientReviewerId: task.clientReviewerId },
        user.id,
        task.projectId,
      );

      const track = STAGE_ROLE_MAP[targetStage];
      if (track === "developer" && !task.developerId && autoAssigneeId) {
        stickyUpdates.developerId = autoAssigneeId;
      }
      if (track === "client" && !task.clientReviewerId && autoAssigneeId) {
        stickyUpdates.clientReviewerId = autoAssigneeId;
      }
    }

    const updated = await prisma.task.update({
      where: { id: data.taskId },
      data: {
        stage: targetStage,
        order: data.order,
        ...(isEnteringDev && !task.startedAt && { startedAt: new Date() }),
        ...(isEnteringDev && data.estimatedMinutes && { estimatedMinutes: data.estimatedMinutes }),
        ...(estimateAccuracy && { estimateAccuracy }),
        ...(autoAssigneeId !== undefined && { assigneeId: autoAssigneeId }),
        ...stickyUpdates,
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
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

const DECLINE_TARGETS: Record<string, "NEW_REQUEST" | "CLARIFICATION" | "READY_FOR_DEV" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "CLIENT_REVIEW" | "READY_FOR_RELEASE" | "DONE"> = {
  INTERNAL_REVIEW: "IN_DEVELOPMENT",
  CLIENT_REVIEW: "INTERNAL_REVIEW",
};

export async function declineTask(data: {
  taskId: string;
  comment: string;
  attachments?: { filename: string; url: string; fileSize?: number; mimeType?: string }[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!data.comment.trim()) {
      return { success: false, error: "A comment explaining the reason is required when declining a task" };
    }

    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      select: {
        id: true,
        stage: true,
        projectId: true,
        order: true,
        title: true,
        taskNumber: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!task) return { success: false, error: "Task not found" };

    const targetStage = DECLINE_TARGETS[task.stage];
    if (!targetStage) {
      return { success: false, error: `This task cannot be declined from stage "${task.stage}"` };
    }

    const { user, member } = await requireProjectMember(task.projectId);

    if (user.systemRole !== "ADMIN") {
      const perms = getPermissionsFromRole(member.projectRole);
      if (!perms.isAdmin && !perms.canDeclineTask) {
        return { success: false, error: "You do not have permission to decline tasks" };
      }
    }

    // Find who moved this task into the stage it's being declined from, so we
    // can @mention them (the "previous owner") on the decline comment.
    const entryActivity = await prisma.taskActivity.findFirst({
      where: {
        taskId: task.id,
        field: "stage",
        newValue: task.stage,
        action: { in: ["moved", "declined"] },
      },
      orderBy: { createdAt: "desc" },
      select: { userId: true, user: { select: { id: true, name: true } } },
    });

    // Resolve who to @mention (and notify) on the rejection. Primary: whoever
    // moved the task into the stage it's being declined from. Fallback: the
    // current assignee, so a rejection always has someone to notify.
    let submitterId: string | null = null;
    let submitterName: string | null = null;
    if (entryActivity?.user && entryActivity.userId !== user.id) {
      submitterId = entryActivity.userId;
      submitterName = entryActivity.user.name ?? null;
    } else if (task.assignee && task.assigneeId !== user.id) {
      submitterId = task.assignee.id;
      submitterName = task.assignee.name ?? null;
    }

    const mentionUserIds: string[] = submitterId ? [submitterId] : [];
    let content = `⚠️ **Declined from ${task.stage.replaceAll("_", " ")}**: ${data.comment}`;
    if (submitterId) {
      content += `\n\n@${submitterName ?? "user"}`;
    }

    const declineComment = await prisma.taskComment.create({
      data: {
        content,
        taskId: task.id,
        userId: user.id,
        ...(mentionUserIds.length && {
          mentions: { create: mentionUserIds.map((id) => ({ userId: id })) },
        }),
        ...(data.attachments?.length && {
          attachments: {
            create: data.attachments.map((a) => ({
              filename: a.filename,
              url: a.url,
              fileSize: a.fileSize ?? null,
              mimeType: a.mimeType ?? null,
            })),
          },
        }),
      },
    });

    // Stream the decline comment to anyone viewing this task (best-effort).
    void publish(taskChannel(task.id), {
      type: "comment.new",
      commentId: declineComment.id,
      authorId: user.id,
    });

    // Post the rejection into the project chat channel so it shows in the
    // project chat + inbox, and notify the submitter (bell + OS push).
    const declineSnippet = data.comment.replace(/\s+/g, " ").trim().slice(0, 140);
    // Mention marker is placed first so the chat renders "@Name  reason".
    const rejectionBody = submitterId
      ? `@[${submitterName ?? "user"}](${submitterId}) ${data.comment}`
      : data.comment;

    const rejectionMessage = await prisma.message.create({
      data: {
        taskId: task.id,
        projectId: task.projectId,
        authorId: user.id,
        body: rejectionBody,
        kind: "rejection",
        ...(submitterId && { mentions: { create: [{ memberId: submitterId }] } }),
        ...(data.attachments?.length && {
          attachments: {
            create: data.attachments.map((a) => ({
              filename: a.filename,
              url: a.url,
              fileSize: a.fileSize ?? null,
              mimeType: a.mimeType ?? null,
            })),
          },
        }),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: {
          select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
        },
      },
    });

    const authorName =
      rejectionMessage.author.name ?? rejectionMessage.author.email ?? "Someone";
    const displayBody = rejectionBody.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, "@$1");
    const rejectionDto = {
      id: rejectionMessage.id,
      taskId: task.id,
      projectId: task.projectId,
      conversationId: null,
      kind: "rejection",
      authorId: user.id,
      authorName,
      body: displayBody,
      createdAt: rejectionMessage.createdAt.toISOString(),
      attachments: rejectionMessage.attachments.map((a) => ({
        id: a.id,
        name: a.filename,
        url: a.url,
        contentType: a.mimeType,
        sizeBytes: a.fileSize,
        isImage: Boolean(a.mimeType && a.mimeType.startsWith("image/")),
      })),
      replyToId: null,
      task: {
        id: task.id,
        projectId: task.projectId,
        number: task.taskNumber,
        title: task.title,
      },
      mentions: submitterName ? [submitterName] : [],
    };

    void broadcast([taskChannel(task.id), projectChannel(task.projectId)], {
      type: "message.new",
      message: rejectionDto,
    });

    if (submitterId) {
      const title = `${user.name ?? "Someone"} declined "${task.title}"`;
      const notifBody = `#${task.taskNumber} ${task.title}: ${declineSnippet}`;
      const linkUrl = `/dashboard/projects/${task.projectId}/tasks/${task.id}`;
      await prisma.notification.create({
        data: { recipientId: submitterId, type: "rejection", title, body: notifBody, linkUrl },
      });
      void broadcast([userChannel(submitterId)], { type: "notification.new" });
      void sendPush([submitterId], {
        title,
        body: notifBody,
        url: linkUrl,
        tag: `task-${task.id}`,
      });
    }

    // Bump the project thread in the inbox sidebar for the people involved.
    const inboxTargets = [...new Set([user.id, ...(submitterId ? [submitterId] : [])])];
    void broadcast(inboxTargets.map(userChannel), {
      type: "inbox",
      threadId: `project-${task.projectId}`,
      projectId: task.projectId,
      taskId: null,
      conversationId: null,
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
    return { success: true };
  } catch (err) {
    return { success: false, error: `Unexpected: ${(err as Error).message}` };
  }
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

  await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: new Date() },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "archived",
    field: "stage",
    oldValue: task.stage,
  });

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-deleted", taskId, userId: user.id });
}

export async function getArchivedTasks(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.task.findMany({
    where: { projectId, archivedAt: { not: null } },
    include: {
      createdBy: { select: { id: true, name: true, imageUrl: true } },
      assignee: { select: { id: true, name: true, imageUrl: true } },
      answers: true,
    },
    orderBy: { archivedAt: "desc" },
  });
}

export async function restoreTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!task) throw new Error("Task not found");

  const { user } = await requireProjectMember(task.projectId);
  if (user.systemRole !== "ADMIN") {
    throw new Error("Only admins can restore archived tasks");
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId: task.projectId, stage: task.stage, archivedAt: null },
    _max: { order: true },
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: null, order: (maxOrder._max.order ?? 0) + 1 },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "restored",
    field: "stage",
    newValue: task.stage,
  });

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-created", taskId, userId: user.id });
}

export async function permanentlyDeleteTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, answers: true },
  });
  if (!task) throw new Error("Task not found");
  if (!task.archivedAt) throw new Error("Task must be archived before permanent deletion");

  const { user } = await requireProjectMember(task.projectId);
  if (user.systemRole !== "ADMIN") {
    throw new Error("Only admins can permanently delete tasks");
  }

  const { extractR2Key, deleteManyFromR2 } = await import("@/lib/r2");
  const r2Keys: string[] = [];
  for (const answer of task.answers) {
    if (!answer.answer) continue;
    for (const entry of answer.answer.split("|||")) {
      const sep = entry.indexOf("::");
      if (sep === -1) continue;
      const url = entry.slice(sep + 2);
      const key = extractR2Key(url);
      if (key) r2Keys.push(key);
    }
  }

  await prisma.task.delete({ where: { id: taskId } });

  if (r2Keys.length > 0) {
    deleteManyFromR2(r2Keys).catch((err) => console.error("R2 cleanup failed:", err));
  }

  revalidatePath(`/dashboard/projects/${task.projectId}`);
}

const BOARD_TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  taskNumber: true,
  taskType: true,
  stage: true,
  order: true,
  priority: true,
  startedAt: true,
  estimatedMinutes: true,
  estimateAccuracy: true,
  assigneeId: true,
  createdById: true,
  developerId: true,
  clientReviewerId: true,
  projectId: true,
  assignee: { select: { id: true, name: true, imageUrl: true } },
  createdBy: { select: { id: true, name: true, imageUrl: true } },
  answers: { select: { questionId: true, answer: true, question: { select: { type: true } } } },
  stageLogs: {
    where: { exitedAt: null },
    orderBy: { enteredAt: "desc" as const },
    take: 1,
    select: { enteredAt: true },
  },
  _count: { select: { notes: true } },
} as const;

type BoardTaskRow = {
  id: string;
  title: string;
  taskType: string;
  priority: number | null;
  startedAt: Date | null;
  estimatedMinutes: number | null;
  estimateAccuracy: unknown;
  answers: { questionId: string; answer: string; question: { type: string } }[];
  stageLogs: { enteredAt: Date }[];
  _count: { notes: number };
  [key: string]: unknown;
};

function requiredIdsByType(
  requiredQuestions: { id: string; taskType: string; type: string }[],
): Map<string, string[]> {
  const requiredByType = new Map<string, string[]>();
  for (const q of requiredQuestions) {
    if (q.type === "client") continue;
    const list = requiredByType.get(q.taskType) ?? [];
    list.push(q.id);
    requiredByType.set(q.taskType, list);
  }
  return requiredByType;
}

function mapBoardTask(
  task: BoardTaskRow,
  declines: { internal: number; client: number },
  reqIds: string[],
) {
  const answeredIds = new Set(task.answers.map((a) => a.questionId));
  const hasAllRequired = reqIds.every((id) => answeredIds.has(id)) && task.priority != null;

  const waitingOnClient = task.answers.some((a) => {
    if (a.question.type !== "client") return false;
    try {
      const parsed = JSON.parse(a.answer);
      return parsed.needed === true && !parsed.completed;
    } catch { return false; }
  });

  const isReadyForTransition = hasAllRequired && !waitingOnClient;
  const currentLog = task.stageLogs[0];

  return {
    ...task,
    answers: undefined,
    stageLogs: undefined,
    isReadyForTransition,
    startedAt: task.startedAt?.toISOString() ?? null,
    stageEnteredAt: currentLog?.enteredAt?.toISOString() ?? null,
    declineCount: declines.internal + declines.client,
    internalDeclines: declines.internal,
    clientDeclines: declines.client,
    estimatedMinutes: task.estimatedMinutes,
    estimateAccuracy: task.estimateAccuracy,
    notesCount: task._count.notes,
  };
}

export async function getTasksByProject(projectId: string) {
  await requireProjectMember(projectId);

  const [tasks, requiredQuestions, declineCounts] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, archivedAt: null },
      select: BOARD_TASK_SELECT,
      orderBy: { order: "asc" },
    }),
    prisma.defaultQuestion.findMany({
      where: { required: true },
      select: { id: true, taskType: true, type: true },
    }),
    prisma.taskActivity.findMany({
      where: { action: "declined", task: { projectId } },
      select: { taskId: true, oldValue: true },
      take: 500,
    }),
  ]);

  const declinesByTask = new Map<string, { internal: number; client: number }>();
  for (const d of declineCounts) {
    const entry = declinesByTask.get(d.taskId) ?? { internal: 0, client: 0 };
    if (d.oldValue === "CLIENT_REVIEW") entry.client += 1;
    else entry.internal += 1;
    declinesByTask.set(d.taskId, entry);
  }

  const requiredByType = requiredIdsByType(requiredQuestions);

  return tasks.map((task) =>
    mapBoardTask(
      task as unknown as BoardTaskRow,
      declinesByTask.get(task.id) ?? { internal: 0, client: 0 },
      requiredByType.get(task.taskType) ?? [],
    ),
  );
}

// O(1) fetch for a single board task — used by the realtime delta path so a
// remote task event patches one card instead of refetching the whole board.
export async function getBoardTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { ...BOARD_TASK_SELECT, archivedAt: true },
  });
  // Caller (board) treats null as "removed" (deleted or archived off the board).
  if (!task || task.archivedAt) return null;

  await requireProjectMember(task.projectId as string);

  const [requiredQuestions, declineCounts] = await Promise.all([
    prisma.defaultQuestion.findMany({
      where: { required: true, taskType: task.taskType },
      select: { id: true, taskType: true, type: true },
    }),
    prisma.taskActivity.findMany({
      where: { action: "declined", taskId },
      select: { oldValue: true },
    }),
  ]);

  const declines = { internal: 0, client: 0 };
  for (const d of declineCounts) {
    if (d.oldValue === "CLIENT_REVIEW") declines.client += 1;
    else declines.internal += 1;
  }

  const reqIds = (requiredIdsByType(requiredQuestions).get(task.taskType) ?? []);
  return mapBoardTask(task as unknown as BoardTaskRow, declines, reqIds);
}

export async function pollTaskUpdates(projectId: string) {
  await requireProjectMember(projectId);

  const tasks = await prisma.task.findMany({
    where: { projectId, archivedAt: null },
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

export async function getEligibleAssignees(projectId: string, stage: string) {
  await requireProjectMember(projectId);

  const track = STAGE_ROLE_MAP[stage];
  if (!track) return [];

  const allowedSystemRoles = ALLOWED_ROLES_BY_TRACK[track];

  const members = await prisma.projectMember.findMany({
    where: {
      projectId,
      user: { systemRole: { in: allowedSystemRoles as any } },
    },
    select: {
      userId: true,
      user: { select: { id: true, name: true, imageUrl: true, systemRole: true } },
    },
  });

  return members.map((m) => m.user);
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
