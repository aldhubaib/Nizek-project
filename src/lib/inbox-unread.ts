import "server-only";
import { prisma } from "@/lib/prisma";

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

export async function sumInboxMessageUnreads(userId: string): Promise<number> {
  const map = await countInboxMessageUnreads(userId);
  let total = 0;
  for (const n of map.values()) total += n;
  return total;
}
