import "server-only";
import { prisma } from "@/lib/prisma";
import { unreadChatCountFromMaps } from "@/lib/inbox-unread-chats";

export { unreadChatCountFromMaps } from "@/lib/inbox-unread-chats";

type UnreadRow = { id: string; n: number | bigint };

function toCount(n: number | bigint): number {
  const value = typeof n === "bigint" ? Number(n) : n;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Unread inbox counts from messages after each user's ChatReadCursor.
 * Missing cursor → 0 for project/DM threads (do not treat history as unread).
 * Client rooms are the exception: never-opened client chats count every
 * message from someone else, so assigned staff see a bubble without opening
 * them first. Project members who only have view-only access do not — they
 * get the normal missing-cursor = 0 treatment until they open the thread.
 */
export async function countInboxMessageUnreads(
  userId: string,
): Promise<Map<string, number>> {
  const [projectRows, convRows] = await Promise.all([
    prisma.$queryRaw<UnreadRow[]>`
      SELECT m."projectId" AS id, COUNT(*)::int AS n
      FROM "Message" m
      INNER JOIN "ChatReadCursor" c
        ON c."userId" = ${userId}
       AND c."threadId" = ('project-' || m."projectId")
      WHERE m."projectId" IS NOT NULL
        AND m."conversationId" IS NULL
        AND m."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "MessageHidden" h
          WHERE h."messageId" = m.id AND h."userId" = ${userId}
        )
        AND m."authorId" <> ${userId}
        AND m."createdAt" > c."lastReadAt"
        AND EXISTS (
          SELECT 1 FROM "ProjectMember" pm
          INNER JOIN "User" u ON u.id = pm."userId"
          LEFT JOIN "ProjectRole" pr ON pr.id = pm."roleId"
          WHERE pm."projectId" = m."projectId"
            AND pm."userId" = ${userId}
            AND pm.role <> 'CLIENT'
            AND u."systemRole" <> 'CLIENT'
            AND COALESCE(pr."isClient", false) = false
        )
      GROUP BY m."projectId"
    `,
    prisma.$queryRaw<UnreadRow[]>`
      SELECT m."conversationId" AS id, COUNT(*)::int AS n
      FROM "Message" m
      INNER JOIN "Conversation" conv ON conv.id = m."conversationId"
      LEFT JOIN "ChatReadCursor" c
        ON c."userId" = ${userId}
       AND c."threadId" = ('conv-' || m."conversationId")
      WHERE m."conversationId" IS NOT NULL
        AND m."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "MessageHidden" h
          WHERE h."messageId" = m.id AND h."userId" = ${userId}
        )
        AND m."authorId" <> ${userId}
        AND (
          EXISTS (
            SELECT 1
            FROM "ConversationParticipant" p
            WHERE p."conversationId" = conv.id
              AND p."memberId" = ${userId}
          )
          OR (
            conv.kind = 'announcements'
            AND EXISTS (
              SELECT 1 FROM "User" u
              WHERE u.id = ${userId}
                AND u."systemRole" <> 'CLIENT'
            )
          )
          OR (
            conv."projectId" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "ProjectMember" pm
              WHERE pm."projectId" = conv."projectId"
                AND pm."userId" = ${userId}
            )
          )
        )
        AND (
          (c."lastReadAt" IS NOT NULL AND m."createdAt" > c."lastReadAt")
          OR (
            c."lastReadAt" IS NULL
            AND conv.kind = 'client'
            AND EXISTS (
              SELECT 1
              FROM "ConversationParticipant" p
              WHERE p."conversationId" = conv.id
                AND p."memberId" = ${userId}
            )
          )
        )
      GROUP BY m."conversationId"
    `,
  ]);

  const map = new Map<string, number>();
  for (const row of projectRows) {
    if (!row.id) continue;
    map.set(`project-${row.id}`, toCount(row.n));
  }
  for (const row of convRows) {
    if (!row.id) continue;
    map.set(`conv-${row.id}`, toCount(row.n));
  }
  return map;
}

type IdRow = { id: string | null };

/**
 * Threads where an unread message @mentions this person. A reply with no @
 * does not qualify. Same cursor rules as the unread counts.
 */
export async function mentionUnreadThreadIds(userId: string): Promise<Set<string>> {
  const [projectRows, convRows] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`
      SELECT DISTINCT m."projectId" AS id
      FROM "Message" m
      INNER JOIN "MessageMention" mm
        ON mm."messageId" = m.id AND mm."memberId" = ${userId}
      INNER JOIN "ChatReadCursor" c
        ON c."userId" = ${userId}
       AND c."threadId" = ('project-' || m."projectId")
      WHERE m."projectId" IS NOT NULL
        AND m."conversationId" IS NULL
        AND m."deletedAt" IS NULL
        AND m."authorId" <> ${userId}
        AND m."createdAt" > c."lastReadAt"
        AND NOT EXISTS (
          SELECT 1 FROM "MessageHidden" h
          WHERE h."messageId" = m.id AND h."userId" = ${userId}
        )
    `,
    prisma.$queryRaw<IdRow[]>`
      SELECT DISTINCT m."conversationId" AS id
      FROM "Message" m
      INNER JOIN "Conversation" conv ON conv.id = m."conversationId"
      INNER JOIN "MessageMention" mm
        ON mm."messageId" = m.id AND mm."memberId" = ${userId}
      INNER JOIN "ChatReadCursor" c
        ON c."userId" = ${userId}
       AND c."threadId" = ('conv-' || m."conversationId")
      WHERE m."conversationId" IS NOT NULL
        AND m."deletedAt" IS NULL
        AND m."authorId" <> ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM "MessageHidden" h
          WHERE h."messageId" = m.id AND h."userId" = ${userId}
        )
        AND (
          (c."lastReadAt" IS NOT NULL AND m."createdAt" > c."lastReadAt")
          OR (c."lastReadAt" IS NULL AND conv.kind = 'client')
        )
    `,
  ]);
  const ids = new Set<string>();
  for (const row of projectRows) if (row.id) ids.add(`project-${row.id}`);
  for (const row of convRows) if (row.id) ids.add(`conv-${row.id}`);
  return ids;
}

export async function sumInboxMessageUnreads(userId: string): Promise<number> {
  const map = await countInboxMessageUnreads(userId);
  let total = 0;
  for (const n of map.values()) total += n;
  return total;
}

/**
 * App-icon / Chats-tab badge: unread chats excluding note-comment threads.
 * Matches the mobile `unreadChatCount` definition.
 */
export async function countUnreadInboxChats(userId: string): Promise<number> {
  const [messageUnreads, noteRows, markedRows] = await Promise.all([
    countInboxMessageUnreads(userId),
    prisma.conversation.findMany({
      where: { noteCommentThread: { isNot: null } },
      select: { id: true },
    }),
    prisma.chatReadCursor.findMany({
      where: { userId, markedUnread: true },
      select: { threadId: true },
    }),
  ]);
  return unreadChatCountFromMaps({
    messageUnreads,
    noteCommentThreadIds: noteRows.map((r) => r.id),
    markedUnreadThreadIds: markedRows.map((r) => r.threadId),
  });
}
