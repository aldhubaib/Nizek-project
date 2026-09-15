"use server";

/**
 * Comments on workflow records (board cards). Same idea as sprint task
 * comments — mentions, attachments, delete own — but a separate table so
 * TaskComment stays on tasks.
 */

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { notifyAndPush } from "@/lib/notify";

const COMMENT_INCLUDE = {
  user: { select: { id: true, name: true, imageUrl: true } },
  mentions: { include: { user: { select: { id: true, name: true } } } },
  attachments: {
    select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
  },
} as const;

async function requireBoardCard(projectId: string, recordId: string) {
  const row = await prisma.boardRecord.findFirst({
    where: { id: recordId, projectId },
    select: { id: true, title: true, recordNumber: true },
  });
  if (!row) throw new Error("That card no longer exists");
  return row;
}

export async function listRecordComments(input: {
  projectId: string;
  entityType: "board";
  recordId: string;
}) {
  try {
    const { user } = await requireProjectMember(input.projectId);
    await requireBoardCard(input.projectId, input.recordId);
    const comments = await prisma.recordComment.findMany({
      where: {
        entityType: input.entityType,
        recordId: input.recordId,
        projectId: input.projectId,
      },
      orderBy: { createdAt: "asc" },
      include: COMMENT_INCLUDE,
    });
    return { success: true as const, comments, currentUserId: user.id };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Failed to load comments",
    };
  }
}

export async function createRecordComment(input: {
  projectId: string;
  entityType: "board";
  recordId: string;
  content: string;
  mentionedUserIds?: string[];
  attachments?: { filename: string; url: string; fileSize?: number; mimeType?: string }[];
}) {
  try {
    const { user } = await requireProjectMember(input.projectId);
    const card = await requireBoardCard(input.projectId, input.recordId);
    const content = input.content.trim();
    if (!content && !input.attachments?.length) {
      return { success: false as const, error: "Write a comment first" };
    }

    const allowedMentions = input.mentionedUserIds?.length
      ? new Set(
          (
            await prisma.projectMember.findMany({
              where: {
                projectId: input.projectId,
                userId: { in: input.mentionedUserIds },
              },
              select: { userId: true },
            })
          ).map((member) => member.userId),
        )
      : new Set<string>();
    const mentionedUserIds = (input.mentionedUserIds ?? []).filter((id) =>
      allowedMentions.has(id),
    );

    const comment = await prisma.recordComment.create({
      data: {
        entityType: input.entityType,
        recordId: input.recordId,
        projectId: input.projectId,
        content:
          content ||
          (input.attachments?.length
            ? `📎 ${input.attachments.length} file${input.attachments.length > 1 ? "s" : ""} attached`
            : ""),
        userId: user.id,
        ...(mentionedUserIds.length && {
          mentions: {
            create: mentionedUserIds.map((id) => ({ userId: id })),
          },
        }),
        ...(input.attachments?.length && {
          attachments: {
            create: input.attachments.map((file) => ({
              filename: file.filename,
              url: file.url,
              fileSize: file.fileSize ?? null,
              mimeType: file.mimeType ?? null,
            })),
          },
        }),
      },
      include: COMMENT_INCLUDE,
    });

    const mentionRecipients = mentionedUserIds.filter((id) => id !== user.id);
    if (mentionRecipients.length > 0) {
      const snippet = comment.content.replace(/\s+/g, " ").trim().slice(0, 140);
      const title = `${comment.user.name ?? "Someone"} mentioned you`;
      const body = `#${card.recordNumber} ${card.title}: ${snippet}`;
      const linkUrl = `/dashboard/projects/${input.projectId}/board/${input.recordId}`;
      await notifyAndPush(
        {
          recipientIds: mentionRecipients,
          type: "mention",
          title,
          body,
          linkUrl,
          tag: `thread-board-${input.recordId}`,
          threadKey: `board-${input.recordId}`,
          authorId: user.id,
          alias: { projectId: input.projectId, actorUserId: user.id },
        },
        { title, body, url: linkUrl, type: "mention" },
      );
    }

    return { success: true as const, comment };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Failed to post comment",
    };
  }
}

export async function deleteRecordComment(commentId: string) {
  const comment = await prisma.recordComment.findUnique({
    where: { id: commentId },
    include: { attachments: { select: { url: true } } },
  });
  if (!comment) throw new Error("Comment not found");

  const { user } = await requireProjectMember(comment.projectId);
  if (comment.userId !== user.id) {
    throw new Error("You can only delete your own comments");
  }

  await prisma.recordComment.delete({ where: { id: commentId } });

  if (comment.attachments.length > 0) {
    const { extractR2Key, deleteManyFromR2 } = await import("@/lib/r2");
    const keys = comment.attachments
      .map((file) => extractR2Key(file.url))
      .filter((key): key is string => key !== null);
    if (keys.length > 0) {
      deleteManyFromR2(keys).catch(console.error);
    }
  }
}
