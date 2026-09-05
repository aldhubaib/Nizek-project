import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyAndPush } from "@/lib/notify";
import { broadcastInboxPreview } from "@/lib/inbox-broadcast";

/**
 * Everything that happens around a chat message once the row exists:
 * notifications, the conversation's sort position, unread cursors, and the
 * inbox preview each recipient sees.
 *
 * Lives here rather than beside sendMessage because system cards are written
 * straight to the database — they still owe the reader every one of these.
 */
export async function fanOutMessageSideEffects(input: {
  conversationId: string | null;
  projectId: string | null;
  taskId: string | null;
  userId: string;
  isClientRoom: boolean;
  participantIds: string[];
  uniqueRecipients: string[];
  notifyType: string;
  title: string;
  notifBody: string;
  url: string;
  threadId: string;
  authorName: string;
  preview: string;
  notifIcon: string | undefined;
  messageCreatedAt: Date;
}) {
  const {
    conversationId,
    projectId,
    taskId,
    userId,
    isClientRoom,
    participantIds,
    uniqueRecipients,
    notifyType,
    title,
    notifBody,
    url,
    threadId,
    authorName,
    preview,
    notifIcon,
    messageCreatedAt,
  } = input;

  if (uniqueRecipients.length > 0) {
    const pushTag = `thread-${threadId}`;
    // The title embeds the author's real name, so client recipients need their
    // own rendered copy — notifyAndPush stores and pushes both variants.
    await notifyAndPush(
      {
        recipientIds: uniqueRecipients,
        type: notifyType,
        title,
        body: notifBody,
        linkUrl: url,
        tag: pushTag,
        threadKey: threadId,
        authorId: userId,
        alias: { projectId, actorUserId: userId },
      },
      {
        title,
        body: notifBody,
        url,
        type: notifyType,
        icon: notifIcon,
      },
    );
  }

  if (conversationId) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  let inboxTargets: string[];
  if (conversationId) {
    inboxTargets = participantIds;
  } else if (projectId && !taskId) {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    inboxTargets = members.map((m) => m.userId);
    if (!inboxTargets.includes(userId)) inboxTargets.push(userId);
  } else {
    inboxTargets = [...uniqueRecipients, userId];
  }

  const cursorTargets = [...new Set(inboxTargets)].filter((id) => id !== userId);
  if (
    cursorTargets.length > 0 &&
    (conversationId || (projectId && !taskId))
  ) {
    await prisma.chatReadCursor.createMany({
      data: cursorTargets.map((id) => ({
        userId: id,
        threadId,
        lastReadAt: new Date(messageCreatedAt.getTime() - 1),
      })),
      skipDuplicates: true,
    });
  }

  await broadcastInboxPreview(inboxTargets, {
    threadId,
    projectId,
    taskId,
    conversationId,
    kind: isClientRoom ? "client" : conversationId ? "direct" : "project",
    authorId: userId,
    lastAuthor: authorName,
    lastMessage: preview,
    lastAt: new Date().toISOString(),
  });
}
