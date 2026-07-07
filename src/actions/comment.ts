"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { broadcastMentionEvent } from "@/lib/pusher";
import { publish, broadcast, taskChannel, userChannel } from "@/lib/centrifugo";
import { sendPush } from "@/lib/push";

export async function createComment(data: {
  taskId: string;
  content: string;
  mentionedUserIds?: string[];
  attachments?: { filename: string; url: string; fileSize?: number; mimeType?: string }[];
}): Promise<{ success: true; comment: Record<string, unknown> } | { success: false; error: string }> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      select: { projectId: true, taskNumber: true, title: true },
    });
    if (!task) return { success: false, error: "Task not found" };

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

    const mentionRecipients = (data.mentionedUserIds ?? []).filter(
      (id) => id !== user.id,
    );
    if (mentionRecipients.length) {
      broadcastMentionEvent(mentionRecipients, user.id);

      // Feed the notification bell (Notification table) so task-comment
      // mentions live alongside chat/DM notifications.
      const snippet = data.content.replace(/\s+/g, " ").trim().slice(0, 140);
      await prisma.notification.createMany({
        data: mentionRecipients.map((rid) => ({
          recipientId: rid,
          type: "mention",
          title: `${comment.user.name ?? "Someone"} mentioned you`,
          body: `#${task.taskNumber} ${task.title}: ${snippet}`,
          linkUrl: `/dashboard/projects/${task.projectId}/tasks/${data.taskId}`,
        })),
      });
      void broadcast(
        mentionRecipients.map((rid) => userChannel(rid)),
        { type: "notification.new" },
      );
      void sendPush(mentionRecipients, {
        title: `${comment.user.name ?? "Someone"} mentioned you`,
        body: `#${task.taskNumber} ${task.title}: ${snippet}`,
        url: `/dashboard/projects/${task.projectId}/tasks/${data.taskId}`,
        tag: `task-${data.taskId}`,
      });
    }

    // Live-stream the new comment to anyone viewing this task (Centrifugo).
    // Best-effort; no-op when Centrifugo isn't configured.
    void publish(taskChannel(data.taskId), {
      type: "comment.new",
      commentId: comment.id,
      authorId: user.id,
    });

    return { success: true, comment: comment as unknown as Record<string, unknown> };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getComments(taskId: string): Promise<{ success: true; comments: Record<string, unknown>[] } | { success: false; error: string }> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) return { success: false, error: "Task not found" };

    await requireProjectMember(task.projectId);

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, imageUrl: true } },
        mentions: { include: { user: { select: { id: true, name: true } } } },
        attachments: { select: { id: true, filename: true, url: true, fileSize: true, mimeType: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, comments: comments as unknown as Record<string, unknown>[] };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
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
