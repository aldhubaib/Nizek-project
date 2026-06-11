"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { broadcastMentionEvent } from "@/lib/pusher";

export async function createComment(data: {
  taskId: string;
  content: string;
  mentionedUserIds?: string[];
  attachments?: { filename: string; url: string; fileSize?: number; mimeType?: string }[];
}) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: { projectId: true },
  });
  if (!task) throw new Error("Task not found");

  const { user } = await requireProjectMember(task.projectId);

  const comment = await prisma.taskComment.create({
    data: {
      content: data.content,
      taskId: data.taskId,
      userId: user.id,
      ...(data.mentionedUserIds?.length && {
        mentions: {
          create: data.mentionedUserIds.map((id) => ({ userId: id })),
        },
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
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, url: true, fileSize: true, mimeType: true } },
    },
  });

  if (data.mentionedUserIds?.length) {
    broadcastMentionEvent(data.mentionedUserIds, user.id);
  }

  return comment;
}

export async function getComments(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw new Error("Task not found");

  await requireProjectMember(task.projectId);

  return prisma.taskComment.findMany({
    where: { taskId },
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, url: true, fileSize: true, mimeType: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteComment(commentId: string) {
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: {
      task: { select: { projectId: true } },
      attachments: { select: { url: true } },
    },
  });
  if (!comment) throw new Error("Comment not found");

  const { user } = await requireProjectMember(comment.task.projectId);

  if (comment.userId !== user.id) {
    throw new Error("You can only delete your own comments");
  }

  await prisma.taskComment.delete({ where: { id: commentId } });

  if (comment.attachments.length > 0) {
    const { extractR2Key, deleteManyFromR2 } = await import("@/lib/r2");
    const keys = comment.attachments
      .map((a) => extractR2Key(a.url))
      .filter((k): k is string => k !== null);
    if (keys.length > 0) {
      deleteManyFromR2(keys).catch(console.error);
    }
  }
}

export async function getProjectMembersForMention(projectId: string) {
  const { user } = await requireProjectMember(projectId);

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
  });

  return { members: members.map((m) => m.user), currentUserId: user.id };
}
