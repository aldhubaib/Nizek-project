"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  ANNOUNCEMENTS_CONVERSATION_ID,
  ANNOUNCEMENTS_TITLE,
  canReadAnnouncements,
} from "@/lib/announcements";
import { CLIENT_CONVERSATION_KIND, isClientUser } from "@/lib/client-chat";
import { messageSearchSnippet } from "@/lib/message-search";

const PAGE_SIZE = 30;
const MIN_QUERY = 2;

export type MessageSearchHit = {
  id: string;
  threadId: string;
  threadName: string;
  authorName: string;
  createdAt: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  starred: boolean;
  oneToOne: boolean;
};

type RawHit = {
  id: string;
  searchText: string | null;
  createdAt: Date;
  conversationId: string | null;
  projectId: string | null;
  authorName: string | null;
  authorEmail: string;
  starred: boolean;
};

/**
 * Messages the viewer can already open, newest first.
 * Task-only rows live in the project chat (`conversationId` null), so they
 * come back as that project room. Rooms the viewer cannot open are not queried.
 */
export async function searchMessages(input: {
  q: string;
  before?: string | null;
  beforeId?: string | null;
}): Promise<{ messages: MessageSearchHit[]; hasMore: boolean }> {
  const user = await requireUser();
  const q = input.q.trim();
  if (q.length < MIN_QUERY) return { messages: [], hasMore: false };

  const scope = await searchScope(user);
  if (scope.conversationIds.length === 0 && scope.projectIds.length === 0) {
    return { messages: [], hasMore: false };
  }

  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const scopeSql = scopeFilter(scope);
  const beforeAt = input.before ? new Date(input.before) : null;
  const cursorSql =
    beforeAt && !Number.isNaN(beforeAt.getTime()) && input.beforeId
      ? Prisma.sql`AND (m."createdAt", m.id) < (${beforeAt}, ${input.beforeId})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<RawHit[]>(Prisma.sql`
    SELECT
      m.id,
      m."searchText",
      m."createdAt",
      m."conversationId",
      m."projectId",
      u.name AS "authorName",
      u.email AS "authorEmail",
      EXISTS (
        SELECT 1 FROM "ImportantMessage" i
        WHERE i."messageId" = m.id AND i."userId" = ${user.id}
      ) AS starred
    FROM "Message" m
    JOIN "User" u ON u.id = m."authorId"
    WHERE m."deletedAt" IS NULL
      AND m."searchText" ILIKE ${pattern} ESCAPE '\\'
      AND (${scopeSql})
      ${cursorSql}
    ORDER BY m."createdAt" DESC, m.id DESC
    LIMIT ${PAGE_SIZE + 1}
  `);

  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const names = await threadNames(user.id, page);

  return {
    hasMore,
    messages: page.map((row) => {
      const placed = names.get(row.conversationId ?? `project:${row.projectId}`) ?? {
        threadId: row.conversationId ? `conv-${row.conversationId}` : `project-${row.projectId}`,
        threadName: "Chat",
        oneToOne: false,
      };
      const snippet = messageSearchSnippet(row.searchText ?? "", q);
      return {
        id: row.id,
        threadId: placed.threadId,
        threadName: placed.threadName,
        authorName: row.authorName ?? row.authorEmail ?? "Someone",
        createdAt: new Date(row.createdAt).toISOString(),
        snippet: snippet.snippet,
        matchStart: snippet.matchStart,
        matchEnd: snippet.matchEnd,
        starred: Boolean(row.starred),
        oneToOne: placed.oneToOne,
      };
    }),
  };
}

function scopeFilter(scope: { conversationIds: string[]; projectIds: string[] }): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (scope.conversationIds.length > 0) {
    parts.push(Prisma.sql`m."conversationId" IN (${Prisma.join(scope.conversationIds)})`);
  }
  if (scope.projectIds.length > 0) {
    parts.push(
      Prisma.sql`(m."conversationId" IS NULL AND m."projectId" IN (${Prisma.join(scope.projectIds)}))`,
    );
  }
  return Prisma.join(parts, " OR ");
}

async function searchScope(user: { id: string; systemRole: string }): Promise<{
  conversationIds: string[];
  projectIds: string[];
}> {
  if (isClientUser(user)) {
    const rooms = await prisma.conversation.findMany({
      where: {
        kind: CLIENT_CONVERSATION_KIND,
        participants: { some: { memberId: user.id } },
        project: { clientChatEnabled: true },
      },
      select: { id: true },
    });
    return { conversationIds: rooms.map((room) => room.id), projectIds: [] };
  }

  const [memberships, projects, clientRooms] = await Promise.all([
    prisma.conversationParticipant.findMany({
      where: { memberId: user.id },
      select: { conversationId: true },
    }),
    prisma.project.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true },
    }),
    prisma.conversation.findMany({
      where: {
        kind: CLIENT_CONVERSATION_KIND,
        project: { members: { some: { userId: user.id } } },
      },
      select: { id: true },
    }),
  ]);

  const conversationIds = new Set(memberships.map((row) => row.conversationId));
  for (const room of clientRooms) conversationIds.add(room.id);
  if (canReadAnnouncements(user)) conversationIds.add(ANNOUNCEMENTS_CONVERSATION_ID);

  return {
    conversationIds: [...conversationIds],
    projectIds: projects.map((project) => project.id),
  };
}

type Placed = { threadId: string; threadName: string; oneToOne: boolean };

async function threadNames(viewerId: string, rows: RawHit[]): Promise<Map<string, Placed>> {
  const conversationIds = [
    ...new Set(rows.map((row) => row.conversationId).filter((id): id is string => Boolean(id))),
  ];
  const projectIds = [
    ...new Set(
      rows
        .filter((row) => !row.conversationId && row.projectId)
        .map((row) => row.projectId as string),
    ),
  ];

  const [conversations, projects] = await Promise.all([
    conversationIds.length
      ? prisma.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: {
            id: true,
            title: true,
            kind: true,
            isGroup: true,
            projectId: true,
            project: { select: { name: true } },
            noteCommentThread: { select: { note: { select: { title: true } } } },
            taskHighlightThread: { select: { task: { select: { title: true } } } },
            participants: {
              select: { memberId: true, member: { select: { name: true, email: true } } },
            },
          },
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const out = new Map<string, Placed>();
  for (const project of projects) {
    out.set(`project:${project.id}`, {
      threadId: `project-${project.id}`,
      threadName: project.name,
      oneToOne: false,
    });
  }
  for (const conversation of conversations) {
    const noteTitle = conversation.noteCommentThread?.note.title;
    const taskTitle = conversation.taskHighlightThread?.task.title;
    const peer = conversation.participants.find((person) => person.memberId !== viewerId);
    const oneToOne =
      conversation.kind === "direct" &&
      !conversation.isGroup &&
      !noteTitle &&
      !taskTitle &&
      !conversation.projectId;
    const threadName =
      conversation.id === ANNOUNCEMENTS_CONVERSATION_ID
        ? ANNOUNCEMENTS_TITLE
        : conversation.kind === CLIENT_CONVERSATION_KIND
          ? (conversation.project?.name ?? conversation.title ?? "Client chat")
          : (noteTitle ??
            taskTitle ??
            (oneToOne
              ? (peer?.member.name ?? peer?.member.email ?? conversation.title ?? "Direct message")
              : (conversation.title ?? conversation.project?.name ?? "Chat")));
    out.set(conversation.id, {
      threadId: `conv-${conversation.id}`,
      threadName,
      oneToOne,
    });
  }
  return out;
}
