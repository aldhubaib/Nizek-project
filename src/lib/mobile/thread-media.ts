import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveThreadAccess } from "@/lib/chat-auth";
import { parseThreadId } from "@/lib/mobile/route";
import { threadScopeSql } from "@/lib/mobile/thread-media-scope";

const PAGE_SIZE = 40;

export type ThreadMediaItem = {
  id: string;
  messageId: string;
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  isImage: boolean;
  createdAt: string;
};

export type ThreadMediaPage = {
  items: ThreadMediaItem[];
  hasMore: boolean;
};

/**
 * Shared photos/videos/files for Chat Info. Auth via resolveThreadAccess;
 * scope matches the thread's Message rows (project vs conversation).
 */
export async function listThreadMedia(
  threadId: string,
  cursor: { before: string; beforeId: string } | null,
): Promise<ThreadMediaPage> {
  const user = await requireUser();
  const target = parseThreadId(threadId);
  const access = await resolveThreadAccess(user, target);
  if (!access.allowed) throw new Error("Permission denied");

  const scope = threadScopeSql(target);
  if (!scope) return { items: [], hasMore: false };

  const beforeAt = cursor?.before ? new Date(cursor.before) : null;
  const cursorSql =
    beforeAt && !Number.isNaN(beforeAt.getTime()) && cursor?.beforeId
      ? Prisma.sql`AND (a."createdAt", a.id) < (${beforeAt}, ${cursor.beforeId})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      filename: string;
      url: string;
      mimeType: string | null;
      fileSize: number | null;
      createdAt: Date;
      messageId: string;
    }[]
  >(Prisma.sql`
    SELECT
      a.id,
      a.filename,
      a.url,
      a."mimeType",
      a."fileSize",
      a."createdAt",
      m.id AS "messageId"
    FROM "MessageAttachment" a
    JOIN "Message" m ON m.id = a."messageId"
    WHERE m."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "MessageHidden" h
        WHERE h."messageId" = m.id AND h."userId" = ${user.id}
      )
      AND (${scope})
      ${cursorSql}
    ORDER BY a."createdAt" DESC, a.id DESC
    LIMIT ${PAGE_SIZE + 1}
  `);

  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return {
    hasMore,
    items: page.map((row) => ({
      id: row.id,
      messageId: row.messageId,
      name: row.filename,
      url: row.url,
      contentType: row.mimeType,
      sizeBytes: row.fileSize,
      isImage: isImageMime(row.mimeType, row.filename),
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  };
}

function isImageMime(mime: string | null, name: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
}
