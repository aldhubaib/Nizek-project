import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyAndPush, type CreatedNotification } from "@/lib/notify";
import { broadcastInboxPreview } from "@/lib/inbox-broadcast";
import { NIZEK_BOT_AUTHOR_ID } from "@/lib/deadline-reminder-payload";

/**
 * Everything that happens around a chat message once the row exists:
 * notifications, the conversation's sort position, unread cursors, and the
 * inbox preview each recipient sees.
 *
 * Lives here rather than beside sendMessage because system cards are written
 * straight to the database — they still owe the reader every one of these.
 */
export type MessageFanOutInput = {
  conversationId: string | null;
  projectId: string | null;
  taskId: string | null;
  userId: string;
  isClientRoom: boolean;
  participantIds: string[];
  /** Candidates for a notification; the per-thread level filter decides. */
  uniqueRecipients: string[];
  /** Who the message names — what level "mentions" keys on. */
  mentionedIds?: string[];
  notifyType: string;
  title: string;
  notifBody: string;
  url: string;
  threadId: string;
  authorName: string;
  preview: string;
  notifIcon: string | undefined;
  messageCreatedAt: Date;
  /** Sprint cards in the client room speak as Nizek Bot rather than the actor. */
  asBot?: boolean;
};

/**
 * The notification + push step on its own. It is the one part of the fan-out
 * that is NOT safe to run twice (each run creates Notification rows), so the
 * worker tracks it separately and skips it on a retry once it has succeeded.
 */
export async function notifyMessageRecipients(
  input: MessageFanOutInput,
): Promise<CreatedNotification[]> {
  const {
    userId,
    uniqueRecipients,
    mentionedIds,
    notifyType,
    title,
    notifBody,
    url,
    threadId,
    notifIcon,
    asBot,
  } = input;
  if (uniqueRecipients.length === 0) return [];
  const pushTag = `thread-${threadId}`;
  return notifyAndPush(
    {
      recipientIds: uniqueRecipients,
      type: notifyType,
      title,
      body: notifBody,
      linkUrl: url,
      tag: pushTag,
      threadKey: threadId,
      mentionedIds: mentionedIds ?? [],
      authorId: asBot ? NIZEK_BOT_AUTHOR_ID : userId,
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

export async function fanOutMessageSideEffects(
  input: MessageFanOutInput,
  opts: {
    /** Notifications were already created (worker retry) — do the rest only. */
    skipNotifications?: boolean;
  } = {},
) {
  const {
    conversationId,
    projectId,
    taskId,
    userId,
    isClientRoom,
    participantIds,
    uniqueRecipients,
    mentionedIds,
    threadId,
    authorName,
    preview,
    messageCreatedAt,
    asBot,
  } = input;

  if (!opts.skipNotifications) {
    await notifyMessageRecipients(input);
  }

  // Everything below is idempotent: re-running it after a crash is harmless.

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
    // Task threads surface in the inbox only for the people the comment
    // names (plus the author), as before — candidates may now be the whole
    // project, but that is for the notification level filter, not the inbox.
    inboxTargets = [...(mentionedIds ?? uniqueRecipients), userId];
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
    authorId: asBot ? NIZEK_BOT_AUTHOR_ID : userId,
    lastAuthor: authorName,
    lastMessage: preview,
    lastAt: new Date().toISOString(),
  });
}
