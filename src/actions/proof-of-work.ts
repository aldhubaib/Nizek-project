"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { logTaskActivity } from "@/lib/activity";
import { taskCode, type TaskPriorityId } from "@/lib/task-label";
import { moveTask } from "@/actions/task";
import {
  ensureBypassConversation,
  notifyRequesterInMailbox,
  postBypassInbox,
  postBypassToProjectChat,
} from "@/lib/deliver-proof-bypass";
import type { ProofBypassPayload } from "@/lib/proof-bypass-payload";
import { publish, projectChannel } from "@/lib/centrifugo";
import { isProofApprovedStage } from "@/lib/proof-of-work";
import {
  canHandOverVideo,
  proofVideoModeOf,
  taskVideoRequired,
  type ProofVideoMode,
} from "@/lib/proof-video-mode";

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
    priority: TaskPriorityId;
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

/**
 * Who may act on a video request: the members assigned as uploaders
 * (`canBypassProof`), project-role admins and system admins.
 */
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

const UPLOADER_SELECT = {
  user: { select: { id: true, name: true, imageUrl: true } },
} as const;

async function assignedUploaders(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId, canBypassProof: true },
    select: UPLOADER_SELECT,
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => m.user);
}

async function projectProofVideoMode(projectId: string): Promise<ProofVideoMode> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { proofVideoMode: true },
  });
  return proofVideoModeOf(project?.proofVideoMode);
}

export type ProofVideoSettings = {
  mode: ProofVideoMode;
  /** The members assigned to upload videos on behalf of others. */
  uploaders: { id: string; name: string | null; imageUrl: string | null }[];
  /** Whether a task may be handed to those uploaders right now. */
  canHandOver: boolean;
  /** Whether the viewer is one of the people who may upload for others. */
  canUploadForOthers: boolean;
};

/** The project's video rule, as the proof dialog and the settings pages need it. */
export async function getProofVideoSettings(projectId: string): Promise<ProofVideoSettings> {
  const { user } = await requireProjectMember(projectId);
  const [mode, uploaders, canUploadForOthers] = await Promise.all([
    projectProofVideoMode(projectId),
    assignedUploaders(projectId),
    canApproveBypass(projectId, user.id, user.systemRole === "ADMIN"),
  ]);
  return {
    mode,
    uploaders,
    canHandOver: canHandOverVideo(mode) && uploaders.length > 0,
    canUploadForOthers,
  };
}

/** Whether the viewer may upload a proof video on behalf of another member. */
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
      task: { select: { id: true, title: true, taskNumber: true, taskType: true, stage: true, priority: true, projectId: true } },
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

/**
 * Ask the project's assigned uploaders to record and upload this task's proof
 * video. Only a project in the "Assign" video mode offers this; the task moves
 * into Internal Review when one of them uploads (see `uploadProofForRequest`).
 */
export async function requestProofBypass(taskId: string): Promise<ProofBypassStatus> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { name: true, proofVideoMode: true } } },
  });
  if (!task) throw new Error("Task not found");
  const { user } = await requireProjectMember(task.projectId);
  if (!canHandOverVideo(proofVideoModeOf(task.project.proofVideoMode))) {
    throw new Error("This project asks everyone to upload their own video.");
  }
  if ((await assignedUploaders(task.projectId)).length === 0) {
    throw new Error("No one on this project is assigned to upload videos yet.");
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
  const threadTitle = `Video · ${taskCode(task.taskType, task.taskNumber)} ${task.title}`;
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
  createdAt: Date;
};

export type TaskProofVideoGroups = {
  approved: TaskProofVideo[];
  history: TaskProofVideo[];
};

const VIDEO_SELECT = {
  id: true,
  filename: true,
  url: true,
  fileSize: true,
  mimeType: true,
} as const;

function videosWithProofDate(
  proof: { createdAt: Date; videos: Omit<TaskProofVideo, "createdAt">[] },
): TaskProofVideo[] {
  return proof.videos.map((video) => ({ ...video, createdAt: proof.createdAt }));
}

export async function getTaskProofVideos(taskId: string): Promise<TaskProofVideoGroups> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, stage: true },
  });
  if (!task) return { approved: [], history: [] };
  await requireProjectMember(task.projectId);

  const proofs = await prisma.proofOfWork.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      videos: { orderBy: { createdAt: "desc" }, select: VIDEO_SELECT },
    },
  });

  if (proofs.length === 0) return { approved: [], history: [] };

  const [latest, ...older] = proofs;
  const previous = older.flatMap(videosWithProofDate);

  if (isProofApprovedStage(task.stage)) {
    return { approved: videosWithProofDate(latest), history: previous };
  }

  return {
    approved: [],
    history: [...videosWithProofDate(latest), ...previous],
  };
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
    select: {
      id: true,
      projectId: true,
      stage: true,
      title: true,
      taskNumber: true,
      taskType: true,
      project: { select: { proofVideoMode: true } },
    },
  });
  if (!task) return { success: false, error: "Task not found" };
  const { user } = await requireProjectMember(task.projectId);

  const videos = (data.videos ?? []).filter((v) => v.url && v.filename);
  let bypassedById: string | null = null;
  let passId: string | null = null;

  // "No video" projects prove the sprint, not the task: the move needs nothing.
  if (videos.length === 0 && !taskVideoRequired(proofVideoModeOf(task.project.proofVideoMode))) {
    return moveTask({ taskId: task.id, stage: data.stage, order: data.order });
  }

  if (videos.length === 0) {
    if (!data.useBypass) {
      return { success: false, error: "Upload at least one video." };
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

  const moved = await moveTask({
    taskId: task.id,
    stage: data.stage,
    order: data.order,
    proofOfWorkId: proof.id,
  });

  if (moved.success && videos.length > 0) {
    await postProofVideosToProjectChat({
      taskId: task.id,
      taskType: task.taskType,
      taskNumber: task.taskNumber,
      taskTitle: task.title,
      videos,
    });
  }

  return moved;
}

/** Already at or past review, so there is nowhere further to move the task. */
const REVIEW_OR_LATER = new Set(["INTERNAL_REVIEW", "DONE", "COMPLETED", "SHIPPED"]);

/**
 * An assigned uploader (or an admin) answers a video request by uploading the
 * video themselves. The proof is recorded against the member who asked, with
 * the uploader named on it, and the task moves into Internal Review as if the
 * requester had uploaded. The request is then spent.
 */
export async function uploadProofForRequest(data: {
  passId: string;
  videos: ProofVideoInput[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const pass = await prisma.proofBypassPass.findUnique({
    where: { id: data.passId },
    include: {
      task: {
        select: {
          id: true,
          projectId: true,
          stage: true,
          title: true,
          taskNumber: true,
          taskType: true,
          project: { select: { name: true } },
        },
      },
      requestedBy: { select: { id: true, name: true } },
    },
  });
  if (!pass) return { success: false, error: "Video request not found" };
  const { user } = await requireProjectMember(pass.task.projectId);
  if (!(await canApproveBypass(pass.task.projectId, user.id, user.systemRole === "ADMIN"))) {
    return { success: false, error: "You are not assigned to upload videos on this project" };
  }
  if (pass.status !== "PENDING") {
    return { success: false, error: "This request is no longer waiting" };
  }
  const videos = data.videos.filter((v) => v.url && v.filename);
  if (videos.length === 0) return { success: false, error: "Upload at least one video." };

  const task = pass.task;
  const proof = await prisma.proofOfWork.create({
    data: {
      taskId: task.id,
      createdById: pass.requestedBy.id,
      uploadedById: user.id,
      videos: {
        create: videos.map((v) => ({
          filename: v.filename,
          url: v.url,
          fileSize: v.fileSize,
          mimeType: v.mimeType,
        })),
      },
    },
  });

  if (!REVIEW_OR_LATER.has(task.stage)) {
    const order = await prisma.task.count({
      where: { projectId: task.projectId, stage: "INTERNAL_REVIEW" },
    });
    const moved = await moveTask({
      taskId: task.id,
      stage: "INTERNAL_REVIEW",
      order,
      proofOfWorkId: proof.id,
    });
    if (!moved.success) {
      // Leave the request open and nothing half-done: the uploader sees why
      // and can try again once the task can move.
      await prisma.proofOfWork.delete({ where: { id: proof.id } });
      return moved;
    }
  }

  const now = new Date();
  await prisma.proofBypassPass.update({
    where: { id: pass.id },
    data: { status: "USED", approvedById: user.id, approvedAt: now, usedAt: now },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "proof_of_work",
    field: "videos",
    oldValue: pass.requestedBy.name ?? null,
    newValue: videos.map((v) => v.filename).join(", "),
  });

  await postProofVideosToProjectChat({
    taskId: task.id,
    taskType: task.taskType,
    taskNumber: task.taskNumber,
    taskTitle: task.title,
    videos,
  });

  const payload: ProofBypassPayload = {
    passId: pass.id,
    taskId: task.id,
    projectId: task.projectId,
    projectName: task.project.name,
    taskTitle: task.title,
    taskNumber: task.taskNumber,
    taskType: task.taskType,
    status: "APPROVED",
    requesterId: pass.requestedBy.id,
    requesterName: pass.requestedBy.name ?? "Someone",
    decidedByName: user.name ?? "Someone",
  };
  // The video is up and the task has moved; a failure telling people about it
  // is logged rather than reported as a failed upload.
  try {
    await notifyRequesterInMailbox(pass.id, payload, user.id);
  } catch (err) {
    console.error("[proof upload notify]", err);
  }
  await publish(projectChannel(task.projectId), {
    type: "proof-bypass.approved",
    passId: pass.id,
    taskId: task.id,
    requesterId: pass.requestedBy.id,
    deciderId: user.id,
  });
  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath(`/dashboard/projects/${task.projectId}/bypass-requests`);

  return { success: true };
}

async function postProofVideosToProjectChat(opts: {
  taskId: string;
  taskType: string;
  taskNumber: number;
  taskTitle: string;
  videos: ProofVideoInput[];
}) {
  const { sendMessage } = await import("@/actions/messages");
  const code = taskCode(opts.taskType, opts.taskNumber);
  const count = opts.videos.length;
  const body =
    count === 1
      ? `Proof of work for ${code} ${opts.taskTitle}`
      : `Proof of work (${count} videos) for ${code} ${opts.taskTitle}`;
  const sent = await sendMessage({
    taskId: opts.taskId,
    body,
    attachments: opts.videos.map((video) => ({
      filename: video.filename,
      url: video.url,
      fileSize: video.fileSize,
      mimeType: video.mimeType || "video/mp4",
    })),
  });
  if (!sent.ok) {
    console.error("[proof chat]", sent.error);
  }
}
