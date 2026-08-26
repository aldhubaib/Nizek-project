"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { logTaskActivity } from "@/lib/activity";
import { taskCode } from "@/lib/task-label";
import { moveTask } from "@/actions/task";
import { ensureBypassConversation, postBypassInbox, postBypassToProjectChat } from "@/lib/deliver-proof-bypass";
import type { ProofBypassPayload } from "@/lib/proof-bypass-payload";
import { publish, projectChannel } from "@/lib/centrifugo";

export type ProofVideoInput = {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
};

export type ProofBypassStatus = {
  id: string;
  status: "PENDING" | "APPROVED" | "USED" | "REJECTED";
  approvedByName: string | null;
};

export type ProofBypassRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "USED" | "REJECTED";
  requestedAt: Date;
  requestedBy: { id: string; name: string | null; imageUrl: string | null };
  approvedBy: { id: string; name: string | null; imageUrl: string | null } | null;
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    stage: string;
    projectId: string;
  };
};

export type ProofHistoryItem = {
  id: string;
  createdAt: Date;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  bypassedBy: { id: string; name: string | null; imageUrl: string | null } | null;
  bypassedAt: Date | null;
  videos: { id: string; filename: string; url: string; fileSize: number | null; mimeType: string | null }[];
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function canApproveBypass(projectId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { canBypassProof: true, projectRole: { select: { isAdmin: true } } },
  });
  return Boolean(member?.canBypassProof || member?.projectRole?.isAdmin);
}

async function bypassApproverIds(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: {
      projectId,
      OR: [
        { canBypassProof: true },
        { projectRole: { isAdmin: true } },
        { user: { systemRole: "ADMIN" } },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

async function hasProofBypassApprover(projectId: string) {
  const found = await prisma.projectMember.findFirst({
    where: { projectId, canBypassProof: true },
    select: { id: true },
  });
  return Boolean(found);
}

export async function projectHasProofBypassApprover(projectId: string) {
  await requireProjectMember(projectId);
  return hasProofBypassApprover(projectId);
}

export async function canCurrentUserBypassProof(projectId: string) {
  const { user } = await requireProjectMember(projectId);
  return canApproveBypass(projectId, user.id, user.systemRole === "ADMIN");
}

export async function getProofBypassStatus(taskId: string): Promise<ProofBypassStatus | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) return null;
  const { user } = await requireProjectMember(task.projectId);
  const pass = await prisma.proofBypassPass.findFirst({
    where: { taskId, requestedById: user.id, status: { in: ["PENDING", "APPROVED"] } },
    include: { approvedBy: { select: { name: true } } },
    orderBy: { requestedAt: "desc" },
  });
  if (!pass) return null;
  return {
    id: pass.id,
    status: pass.status as ProofBypassStatus["status"],
    approvedByName: pass.approvedBy?.name ?? null,
  };
}

export async function listProofBypassRequests(projectId: string): Promise<ProofBypassRequest[]> {
  await requireProjectMember(projectId);
  const rows = await prisma.proofBypassPass.findMany({
    where: { task: { projectId } },
    include: {
      requestedBy: { select: { id: true, name: true, imageUrl: true } },
      approvedBy: { select: { id: true, name: true, imageUrl: true } },
      task: { select: { id: true, title: true, taskNumber: true, taskType: true, stage: true, projectId: true } },
    },
    orderBy: { requestedAt: "desc" },
    take: 80,
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status as ProofBypassRequest["status"],
    requestedAt: row.requestedAt,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    task: row.task,
  }));
}

export async function requestProofBypass(taskId: string): Promise<ProofBypassStatus> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { name: true } } },
  });
  if (!task) throw new Error("Task not found");
  const { user } = await requireProjectMember(task.projectId);
  if (!(await hasProofBypassApprover(task.projectId))) {
    throw new Error("No one on this project can approve a bypass.");
  }

  const existing = await prisma.proofBypassPass.findFirst({
    where: { taskId, requestedById: user.id, status: { in: ["PENDING", "APPROVED"] } },
    include: { approvedBy: { select: { name: true } } },
  });
  if (existing) {
    return {
      id: existing.id,
      status: existing.status as ProofBypassStatus["status"],
      approvedByName: existing.approvedBy?.name ?? null,
    };
  }

  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.proofBypassPass.findUnique({ where: { code } });
    if (!clash) break;
    code = randomCode();
  }

  const pass = await prisma.proofBypassPass.create({
    data: { taskId, requestedById: user.id, code },
  });

  const recipients = (await bypassApproverIds(task.projectId)).filter((id) => id !== user.id);
  const payload: ProofBypassPayload = {
    passId: pass.id,
    taskId: task.id,
    projectId: task.projectId,
    projectName: task.project.name,
    taskTitle: task.title,
    taskNumber: task.taskNumber,
    taskType: task.taskType,
    status: "PENDING",
    requesterId: user.id,
    requesterName: user.name ?? "Someone",
  };
  const threadTitle = `Bypass · ${taskCode(task.taskType, task.taskNumber)} ${task.title}`;
  await postBypassToProjectChat(payload, recipients);
  for (const approverId of recipients) {
    const conversationId = await ensureBypassConversation(user.id, approverId, threadTitle);
    await postBypassInbox(conversationId, payload);
  }

  await publish(projectChannel(task.projectId), {
    type: "proof-bypass.requested",
    passId: pass.id,
    taskId: task.id,
    requesterId: user.id,
  });

  return { id: pass.id, status: "PENDING", approvedByName: null };
}

export type TaskProofVideo = {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
};

export async function getTaskProofVideos(taskId: string): Promise<TaskProofVideo[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) return [];
  await requireProjectMember(task.projectId);
  return prisma.proofOfWorkVideo.findMany({
    where: { proof: { taskId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
  });
}

export async function getProofHistory(taskId: string): Promise<ProofHistoryItem[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) return [];
  await requireProjectMember(task.projectId);
  return prisma.proofOfWork.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, imageUrl: true } },
      bypassedBy: { select: { id: true, name: true, imageUrl: true } },
      videos: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function submitProofAndMove(data: {
  taskId: string;
  stage: "INTERNAL_REVIEW";
  order: number;
  videos?: ProofVideoInput[];
  useBypass?: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: { id: true, projectId: true, stage: true },
  });
  if (!task) return { success: false, error: "Task not found" };
  const { user } = await requireProjectMember(task.projectId);

  const videos = (data.videos ?? []).filter((v) => v.url && v.filename);
  let bypassedById: string | null = null;
  let passId: string | null = null;

  if (videos.length === 0) {
    if (!data.useBypass) {
      return { success: false, error: "Upload at least one video, or wait for a bypass." };
    }
    const pass = await prisma.proofBypassPass.findFirst({
      where: { taskId: task.id, requestedById: user.id, status: "APPROVED" },
    });
    if (!pass) return { success: false, error: "No approved bypass for this task." };
    bypassedById = pass.approvedById;
    passId = pass.id;
  }

  const proof = await prisma.proofOfWork.create({
    data: {
      taskId: task.id,
      createdById: user.id,
      bypassedById,
      bypassedAt: bypassedById ? new Date() : null,
      videos: videos.length
        ? {
            create: videos.map((v) => ({
              filename: v.filename,
              url: v.url,
              fileSize: v.fileSize,
              mimeType: v.mimeType,
            })),
          }
        : undefined,
    },
  });

  if (passId) {
    await prisma.proofBypassPass.update({
      where: { id: passId },
      data: { status: "USED", usedAt: new Date() },
    });
  }

  if (videos.length > 0) {
    await logTaskActivity({
      taskId: task.id,
      userId: user.id,
      action: "proof_of_work",
      field: "videos",
      newValue: videos.map((v) => v.filename).join(", "),
    });
  } else {
    const approver = bypassedById
      ? await prisma.user.findUnique({ where: { id: bypassedById }, select: { name: true } })
      : null;
    await logTaskActivity({
      taskId: task.id,
      userId: user.id,
      action: "proof_bypass",
      field: "bypass",
      newValue: approver?.name ?? "manager",
    });
  }

  return moveTask({
    taskId: task.id,
    stage: data.stage,
    order: data.order,
    proofOfWorkId: proof.id,
  });
}
