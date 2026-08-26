import "server-only";
import { prisma } from "@/lib/prisma";

type UnreadRow = { id: string; n: number | bigint };

function toCount(n: number | bigint): number {
  const value = typeof n === "bigint" ? Number(n) : n;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Unread inbox counts from messages after each user's ChatReadCursor.
 * Missing cursor → 0 (do not treat the entire history as unread).
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
        AND m."authorId" <> ${userId}
        AND m."createdAt" > c."lastReadAt"
      GROUP BY m."projectId"
    `,
    prisma.$queryRaw<UnreadRow[]>`
      SELECT m."conversationId" AS id, COUNT(*)::int AS n
      FROM "Message" m
      INNER JOIN "ChatReadCursor" c
        ON c."userId" = ${userId}
       AND c."threadId" = ('conv-' || m."conversationId")
      WHERE m."conversationId" IS NOT NULL
        AND m."authorId" <> ${userId}
        AND m."createdAt" > c."lastReadAt"
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
