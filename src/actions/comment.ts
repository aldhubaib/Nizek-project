"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { publish, taskChannel } from "@/lib/centrifugo";
import { enqueuePush } from "@/lib/push-queue";
import { createAndPublishNotifications } from "@/lib/notify";
import { sendMessage } from "@/actions/messages";
import { encodeTaskCommentBody } from "@/lib/task-comment-payload";

export async function createComment(data: {
  taskId: string;
  content: string;
  mentionedUserIds?: string[];
  attachments?: { filename: string; url: string; fileSize?: number; mimeType?: string }[];
}): Promise<{ success: true; comment: Record<string, unknown> } | { success: false; error: string }> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      select: {
        projectId: true,
        taskNumber: true,
        title: true,
        project: { select: { name: true } },
      },
    });
    if (!task) return { success: false, error: "Task not found" };

    const { user } = await requireProjectMember(task.projectId);

    const allowedMentions = data.mentionedUserIds?.length
      ? new Set(
          (
            await prisma.projectMember.findMany({
              where: { projectId: task.projectId, userId: { in: data.mentionedUserIds } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        )
      : new Set<string>();
    const mentionedUserIds = (data.mentionedUserIds ?? []).filter((id) => allowedMentions.has(id));

    const comment = await prisma.taskComment.create({
      data: {
        content: data.content,
        taskId: data.taskId,
        userId: user.id,
        ...(mentionedUserIds.length && {
          mentions: {
            create: mentionedUserIds.map((id) => ({ userId: id })),
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

    const mentionRecipients = mentionedUserIds.filter(
      (id) => id !== user.id,
    );

    const mentionTokens = comment.mentions.map(
      (m) => `@[${m.user.name ?? "Someone"}](${m.user.id})`,
    );

    // Mirror into the project channel. Best-effort: the task comment stays
    // even if chat post fails (inactive contract, client role, etc.).
    let postedToChannel = false;
    try {
      const posted = await sendMessage({
        projectId: task.projectId,
        body: encodeTaskCommentBody(
          {
            taskId: data.taskId,
            projectId: task.projectId,
            projectName: task.project.name,
            taskTitle: `#${task.taskNumber} ${task.title}`,
            comment: data.content,
          },
          mentionTokens,
        ),
        kind: "task_comment",
        attachments: data.attachments,
      });
      postedToChannel = posted.ok;
      if (!posted.ok) {
        console.error("[task comment chat]", posted.error);
      }
    } catch (err) {
      console.error("[task comment chat]", err);
    }

    // Mentions are notified by sendMessage when the comment lands in the
    // project channel. If that post fails, fall back to a task-page mention.
    if (mentionRecipients.length && !postedToChannel) {
      const snippet = data.content.replace(/\s+/g, " ").trim().slice(0, 140);
      const pushTag = `thread-task-${data.taskId}`;
      const rows = await createAndPublishNotifications({
        recipientIds: mentionRecipients,
        type: "mention",
        title: `${comment.user.name ?? "Someone"} mentioned you`,
        body: `#${task.taskNumber} ${task.title}: ${snippet}`,
        linkUrl: `/dashboard/projects/${task.projectId}/tasks/${data.taskId}`,
        tag: pushTag,
        threadKey: `task-${data.taskId}`,
      });
      if (rows.length > 0) {
        void enqueuePush(
          rows.map((r) => r.recipientId),
          {
            title: `${comment.user.name ?? "Someone"} mentioned you`,
            body: `#${task.taskNumber} ${task.title}: ${snippet}`,
            url: `/dashboard/projects/${task.projectId}/tasks/${data.taskId}`,
            tag: pushTag,
            type: "mention",
          },
        );
      }
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

// Fetch a single comment (for the realtime delta path: append one new comment
// instead of reloading the whole thread on every remote comment event).
export async function getComment(
  commentId: string,
): Promise<{ success: true; comment: Record<string, unknown> } | { success: false; error: string }> {
  try {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: { select: { projectId: true } },
        user: { select: { id: true, name: true, imageUrl: true } },
        mentions: { include: { user: { select: { id: true, name: true } } } },
        attachments: { select: { id: true, filename: true, url: true, fileSize: true, mimeType: true } },
      },
    });
    if (!comment) return { success: false, error: "Comment not found" };

    await requireProjectMember(comment.task.projectId);

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

export async function getProjectMembersForMention(
  projectId: string,
  options?: { excludeClients?: boolean },
) {
  const { user } = await requireProjectMember(projectId);

  const members = await prisma.projectMember.findMany({
    where: {
      projectId,
      ...(options?.excludeClients
        ? {
            role: { not: "CLIENT" },
            user: { systemRole: { not: "CLIENT" } },
            NOT: { projectRole: { isClient: true } },
          }
        : {}),
    },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
  });

  return { members: members.map((m) => m.user), currentUserId: user.id };
}
