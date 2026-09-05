"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import { getActiveContract } from "@/lib/contract-rules";
import { fanOutMessageSideEffects } from "@/lib/message-fanout";
import { unreadCountsFor } from "@/lib/notify";
import { resolveProjectMentionIds } from "@/lib/project-mentions";
import {
  decodeDeadlineReminderPayload,
  isDeadlineReminderMessage,
  NIZEK_BOT_AUTHOR_ID,
  NIZEK_BOT_NAME,
  type DeadlineReminderPayload,
} from "@/lib/deadline-reminder-payload";
import {
  decodeNoteCommentPayload,
  isNoteCommentMessage,
  noteCommentPreview,
  type NoteCommentPayload,
} from "@/lib/note-comment-payload";
import {
  decodeTaskCommentPayload,
  isTaskCommentMessage,
  taskCommentPreview,
  type TaskCommentPayload,
} from "@/lib/task-comment-payload";
import {
  decodeNoteActivityPayload,
  isNoteActivityMessage,
  noteActivityPreview,
  type NoteActivityPayload,
  noteCardShowsExcerpt,
} from "@/lib/note-activity-payload";
import {
  clientIssuePreview,
  decodeClientIssuePayload,
  isClientIssueMessage,
  type ClientIssuePayload,
} from "@/lib/client-issue-payload";
import {
  decodeProofBypassPayload,
  isProofBypassMessage,
  proofBypassPreview,
  type ProofBypassPayload,
} from "@/lib/proof-bypass-payload";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { plainTextExcerpt } from "@/lib/html-annotate";
import { ALL_MENTION_ID, ALL_MENTION_NAME } from "@/lib/mentions";
import {
  broadcast,
  broadcastEphemeral,
  publish,
  taskChannel,
  projectChannel,
  conversationChannel,
  conversationClientChannel,
  userChannel,
} from "@/lib/centrifugo";
import {
  CLIENT_CHANNEL_SUFFIX,
  NOTIFICATION_READ,
  TYPING_EVENT,
} from "@/lib/channels";
import { threadPushTag } from "@/lib/notification-read";
import {
  countInboxMessageUnreads,
  sumInboxMessageUnreads,
} from "@/lib/inbox-unread";
import {
  canAccessClientConversation,
  CLIENT_CONVERSATION_KIND,
  ensureClientInbox,
  isClientUser,
} from "@/lib/client-chat";
import {
  getAliasMap,
  getAliasMapsForProjects,
  maskBody,
  maskImage,
  maskName,
  maskNoteActivity,
  maskPlainNames,
  NO_MASK,
  type AliasIdentity,
} from "@/lib/alias";
import {
  ANNOUNCEMENTS_CONVERSATION_ID,
  ANNOUNCEMENTS_CONVERSATION_KIND,
  ANNOUNCEMENTS_SUBTITLE,
  ANNOUNCEMENTS_THREAD_ID,
  ANNOUNCEMENTS_TITLE,
  announcementAudienceIds,
  canPostAnnouncement,
  canReadAnnouncements,
  getOrCreateAnnouncementsConversation,
} from "@/lib/announcements";

const CONTRACT_SELECT = {
  id: true,
  contractType: true,
  label: true,
  startDate: true,
  endDate: true,
  latePayment: true,
} as const;

// Single write path for every chat surface: project channels, direct messages,
// and (deep-linked) task threads. Persists to Postgres (source of truth),
// creates Notification rows (bell / push), records ChatReadCursor for inbox
// unread, and publishes live via Centrifugo. Identity everywhere is User.id.

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function safeAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[${label}]`, error);
    return { ok: false, error };
  }
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  let match;
  while ((match = MENTION_RE.exec(body)) !== null) {
    ids.add(match[2]);
  }
  return [...ids];
}

/** Strip mention markup down to plain "@Name" for display/previews. */
function toDisplayBody(body: string): string {
  return body.replace(MENTION_RE, "@$1");
}

/**
 * The alias map to apply for this viewer. Employees get an empty map (no
 * masking); clients get the aliases for the project they're looking at.
 */
async function viewerAliasMap(
  user: { systemRole: string },
  projectId: string | null | undefined,
): Promise<Map<string, AliasIdentity>> {
  if (!isClientUser(user)) return NO_MASK;
  return getAliasMap(projectId);
}

/** Proof-bypass payloads embed rendered names, so they need scrubbing too. */
function maskProofBypass(
  payload: ProofBypassPayload | null,
  map: Map<string, AliasIdentity>,
): ProofBypassPayload | null {
  if (!payload || map.size === 0) return payload;
  return {
    ...payload,
    requesterName: maskName(payload.requesterId, payload.requesterName, map),
    decidedByName: payload.decidedByName
      ? maskPlainNames(payload.decidedByName, map)
      : payload.decidedByName,
  };
}

/**
 * Both audience channels for a conversation. Payloads that carry only ids
 * (reactions, deletes, read receipts) can go to both as-is; anything with a
 * name must be published per channel.
 */
function conversationChannelsFor(conversationId: string): string[] {
  return [
    conversationChannel(conversationId),
    conversationClientChannel(conversationId),
  ];
}

/**
 * Client-facing copy of a message DTO. The body here is already rendered
 * ("@Name", quoted comments), so names are matched textually rather than by id.
 */
function maskMessageDTO(
  dto: MessageDTO,
  map: Map<string, AliasIdentity>,
): MessageDTO {
  if (map.size === 0) return dto;
  return {
    ...dto,
    authorName: maskName(dto.authorId, dto.authorName, map),
    authorImageUrl: maskImage(dto.authorId, dto.authorImageUrl, map),
    body: maskPlainNames(dto.body, map),
    mentions: dto.mentions?.map((n) => maskPlainNames(n, map)),
    noteComment: dto.noteComment
      ? {
          ...dto.noteComment,
          comment: maskPlainNames(dto.noteComment.comment, map),
          quoteText: maskPlainNames(dto.noteComment.quoteText, map),
        }
      : dto.noteComment,
    taskComment: dto.taskComment
      ? {
          ...dto.taskComment,
          comment: maskPlainNames(dto.taskComment.comment, map),
          ...(dto.taskComment.quoteText
            ? { quoteText: maskPlainNames(dto.taskComment.quoteText, map) }
            : {}),
        }
      : dto.taskComment,
    noteActivity: maskNoteActivity(dto.noteActivity ?? null, map),
    clientIssue: dto.clientIssue
      ? {
          ...dto.clientIssue,
          title: maskPlainNames(dto.clientIssue.title, map),
          ...(dto.clientIssue.excerpt
            ? { excerpt: maskPlainNames(dto.clientIssue.excerpt, map) }
            : {}),
        }
      : dto.clientIssue,
    proofBypass: maskProofBypass(dto.proofBypass ?? null, map),
  };
}

function inboxPreview(body: string): string {
  const activity = decodeNoteActivityPayload(body);
  if (activity) return noteActivityPreview(activity);
  const issue = decodeClientIssuePayload(body);
  if (issue) return clientIssuePreview(issue);
  const note = decodeNoteCommentPayload(body);
  if (note?.comment) return note.comment;
  const task = decodeTaskCommentPayload(body);
  if (task?.comment) return task.comment;
  const bypass = decodeProofBypassPayload(body);
  if (bypass) return proofBypassPreview(bypass);
  return toDisplayBody(body) || "📎 Attachment";
}

function mapDeadlineReminderMessage<T extends { kind: string; body: string; authorId: string; author: { name: string | null; email: string; imageUrl: string | null } }>(
  c: T,
  aliasMap: Map<string, AliasIdentity> = NO_MASK,
) {
  // Mask before decoding so mention tokens in the header and any real name
  // quoted inside a comment payload are both rewritten.
  const body = maskBody(c.body, aliasMap);
  const payload = decodeDeadlineReminderPayload(body);
  const isBot = isDeadlineReminderMessage(c.kind);
  const noteComment = isNoteCommentMessage(c.kind)
    ? decodeNoteCommentPayload(body)
    : null;
  const taskComment = isTaskCommentMessage(c.kind)
    ? decodeTaskCommentPayload(body)
    : null;
  const noteActivity = isNoteActivityMessage(c.kind)
    ? decodeNoteActivityPayload(body)
    : null;
  const clientIssue = isClientIssueMessage(c.kind)
    ? decodeClientIssuePayload(body)
    : null;
  const proofBypass = maskProofBypass(
    isProofBypassMessage(c.kind) ? decodeProofBypassPayload(body) : null,
    aliasMap,
  );
  const highlight = noteComment ?? taskComment;
  return {
    authorId: isBot ? NIZEK_BOT_AUTHOR_ID : c.authorId,
    authorName: isBot
      ? NIZEK_BOT_NAME
      : maskName(c.authorId, c.author.name ?? c.author.email, aliasMap),
    authorImageUrl: isBot
      ? null
      : maskImage(c.authorId, c.author.imageUrl ?? null, aliasMap),
    body:
      isBot && payload
        ? `@${ALL_MENTION_NAME}`
        : highlight
          ? highlight.comment
          : noteActivity
            ? noteActivityPreview(noteActivity)
            : clientIssue
              ? clientIssuePreview(clientIssue)
              : proofBypass
                ? proofBypassPreview(proofBypass)
                : toDisplayBody(body),
    mentions: isBot && payload ? [ALL_MENTION_NAME] : parseMentionNames(body),
    deadlineReminder: payload,
    noteComment,
    taskComment,
    noteActivity,
    clientIssue,
    proofBypass,
  };
}

/** Names mentioned in a body — the client highlights "@Name" runs as chips. */
function parseMentionNames(body: string): string[] {
  const names = new Set<string>();
  let match;
  while ((match = MENTION_RE.exec(body)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

function isImageType(mimeType: string | null): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}

/** Task summary rendered as a reference card on chat bubbles. */
export type MessageTaskRef = {
  id: string;
  projectId: string;
  number: number;
  title: string;
};

export type MessageAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  isImage: boolean;
};

// A message's reactions grouped by emoji. Each client derives count + "mine".
export type ReactionSummary = { emoji: string; memberIds: string[] };

// Server-side allowlist so arbitrary strings can't be stored as reactions.
const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "🎉", "✅", "👀"];

export type MessageDTO = {
  id: string;
  taskId: string | null;
  projectId: string | null;
  conversationId: string | null;
  kind: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string | null;
  body: string;
  createdAt: string;
  attachments: MessageAttachment[];
  replyToId?: string | null;
  task?: MessageTaskRef | null;
  mentions?: string[];
  deadlineReminder?: DeadlineReminderPayload | null;
  noteComment?: NoteCommentPayload | null;
  taskComment?: TaskCommentPayload | null;
  noteActivity?: NoteActivityPayload | null;
  clientIssue?: ClientIssuePayload | null;
  proofBypass?: ProofBypassPayload | null;
};

type AttachmentInput = {
  filename: string;
  url: string;
  fileSize?: number | null;
  mimeType?: string | null;
};

type SendMessageInput = {
  body: string;
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  kind?: string;
  attachments?: AttachmentInput[];
  replyToId?: string;
};

// ─── Thread messages (paginated) ─────────────────────────────────────────────

const THREAD_PAGE_SIZE = 25;

async function resolveThreadUnreadCursor(
  userId: string,
  input: {
    taskId?: string | null;
    projectId?: string | null;
    conversationId?: string | null;
  },
  messageWhere: {
    taskId?: string;
    projectId?: string;
    conversationId?: string | null;
  },
): Promise<{ lastReadAt: string | null; unreadCount: number }> {
  let lastReadAt: Date | null = null;

  const cursorThreadId = input.conversationId
    ? `conv-${input.conversationId}`
    : input.projectId && !input.taskId
      ? `project-${input.projectId}`
      : null;
  if (cursorThreadId) {
    const cursor = await prisma.chatReadCursor.findUnique({
      where: {
        userId_threadId: { userId, threadId: cursorThreadId },
      },
      select: { lastReadAt: true },
    });
    lastReadAt = cursor?.lastReadAt ?? null;
  }

  if (!lastReadAt && input.conversationId) {
    const row = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_memberId: {
          conversationId: input.conversationId,
          memberId: userId,
        },
      },
      select: { lastReadAt: true },
    });
    lastReadAt = row?.lastReadAt ?? null;
  }

  if (!lastReadAt) {
    const linkUrl = input.conversationId
      ? `/dashboard/messages/conv-${input.conversationId}`
      : input.taskId
        ? `/dashboard/projects/${input.projectId}/tasks/${input.taskId}`
        : input.projectId
          ? `/dashboard/messages/project-${input.projectId}`
          : null;
    if (linkUrl) {
      const [lastReadNotif, oldestUnread] = await Promise.all([
        prisma.notification.findFirst({
          where: {
            recipientId: userId,
            linkUrl,
            read: true,
            readAt: { not: null },
          },
          orderBy: { readAt: "desc" },
          select: { readAt: true },
        }),
        prisma.notification.findFirst({
          where: { recipientId: userId, linkUrl, read: false },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      lastReadAt =
        lastReadNotif?.readAt ??
        (oldestUnread ? new Date(oldestUnread.createdAt.getTime() - 1) : null);
    }
  }

  if (!lastReadAt) return { lastReadAt: null, unreadCount: 0 };

  const unreadCount = await prisma.message.count({
    where: {
      ...messageWhere,
      authorId: { not: userId },
      createdAt: { gt: lastReadAt },
    },
  });

  return { lastReadAt: lastReadAt.toISOString(), unreadCount };
}

export type ThreadMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  replyToId: string | null;
  attachments: MessageAttachment[];
  reactions: ReactionSummary[];
  kind: string;
  task: MessageTaskRef | null;
  mentions: string[];
  deadlineReminder?: DeadlineReminderPayload | null;
  noteComment?: NoteCommentPayload | null;
  taskComment?: TaskCommentPayload | null;
  noteActivity?: NoteActivityPayload | null;
  clientIssue?: ClientIssuePayload | null;
  proofBypass?: ProofBypassPayload | null;
  important: boolean;
};

export type ThreadMessagesPage = {
  messages: ThreadMessage[]; // oldest → newest
  hasMore: boolean;
  /** When this viewer last read the thread. Null = caught up / never read. */
  lastReadAt: string | null;
  /** Other people's messages after lastReadAt. */
  unreadCount: number;
};

export async function getThreadMessages(input: {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  cursorId?: string;
}): Promise<ThreadMessagesPage> {
  const user = await requireUser();

  let where: {
    taskId?: string;
    projectId?: string;
    conversationId?: string | null;
  };
  let aliasProjectId: string | null = null;
  if (input.conversationId) {
    const convoMeta = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, kind: true, projectId: true },
    });
    if (!convoMeta) throw new Error("Permission denied");
    aliasProjectId = convoMeta.projectId;
    if (convoMeta.kind === ANNOUNCEMENTS_CONVERSATION_KIND) {
      if (!canReadAnnouncements(user)) throw new Error("Permission denied");
    } else if (convoMeta.kind === CLIENT_CONVERSATION_KIND) {
      const access = await canAccessClientConversation(input.conversationId, user);
      if (!access.ok) throw new Error("Permission denied");
    } else {
      const convo = await prisma.conversation.findFirst({
        where: {
          id: input.conversationId,
          participants: { some: { memberId: user.id } },
        },
        select: { id: true },
      });
      if (!convo) throw new Error("Permission denied");
    }
    where = { conversationId: input.conversationId };
  } else if (input.taskId) {
    if (isClientUser(user)) throw new Error("Permission denied");
    const task = await prisma.task.findFirst({
      where: { id: input.taskId },
      select: { projectId: true },
    });
    if (!task) throw new Error("Not found");
    if (!(await hasProjectAccess(task.projectId)))
      throw new Error("Permission denied");
    where = { taskId: input.taskId };
  } else if (input.projectId) {
    if (isClientUser(user)) throw new Error("Permission denied");
    if (!(await hasProjectAccess(input.projectId)))
      throw new Error("Permission denied");
    // Internal project chat only — never fold client-room messages in.
    where = { projectId: input.projectId, conversationId: null };
  } else {
    throw new Error("No thread specified");
  }

  const rows = await prisma.message.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, email: true, imageUrl: true } },
      reactions: {
        select: { emoji: true, memberId: true },
        orderBy: { createdAt: "asc" },
      },
      attachments: {
        select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
        orderBy: { createdAt: "asc" },
      },
      task: { select: { id: true, taskNumber: true, title: true, projectId: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: THREAD_PAGE_SIZE + 1,
    ...(input.cursorId ? { cursor: { id: input.cursorId }, skip: 1 } : {}),
  });

  const hasMore = rows.length > THREAD_PAGE_SIZE;
  const page = rows.slice(0, THREAD_PAGE_SIZE).reverse();

  const importantRows = await prisma.importantMessage.findMany({
    where: {
      userId: user.id,
      messageId: { in: page.map((m) => m.id) },
    },
    select: { messageId: true },
  });
  const importantIds = new Set(importantRows.map((r) => r.messageId));
  const aliasMap = await viewerAliasMap(user, aliasProjectId);

  const messages: ThreadMessage[] = page.map((c) => {
    const byEmoji = new Map<string, string[]>();
    for (const r of c.reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.memberId);
      byEmoji.set(r.emoji, list);
    }
    const mapped = mapDeadlineReminderMessage(c, aliasMap);
    const edited =
      c.updatedAt.getTime() - c.createdAt.getTime() > 2000;
    return {
      id: c.id,
      authorId: mapped.authorId,
      authorName: mapped.authorName,
      authorImageUrl: mapped.authorImageUrl,
      body: mapped.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      edited,
      replyToId: c.replyToId ?? null,
      attachments: c.attachments.map((a) => ({
        id: a.id,
        name: a.filename,
        url: a.url,
        contentType: a.mimeType,
        sizeBytes: a.fileSize,
        isImage: isImageType(a.mimeType),
      })),
      reactions: [...byEmoji.entries()].map(([emoji, memberIds]) => ({ emoji, memberIds })),
      kind: c.kind,
      task: c.task
        ? {
            id: c.task.id,
            projectId: c.task.projectId,
            number: c.task.taskNumber,
            title: c.task.title,
          }
        : null,
      mentions: mapped.mentions,
      deadlineReminder: mapped.deadlineReminder,
      noteComment: mapped.noteComment,
      taskComment: mapped.taskComment,
      noteActivity: mapped.noteActivity,
      clientIssue: mapped.clientIssue,
      proofBypass: mapped.proofBypass,
      important: importantIds.has(c.id),
    };
  });

  const missingExcerptIds = [
    ...new Set(
      messages
        .map((m) => m.noteActivity)
        .filter((a): a is NoteActivityPayload =>
          Boolean(a && !a.excerpt && noteCardShowsExcerpt(a.noteType)),
        )
        .map((a) => a.noteId),
    ),
  ];
  if (missingExcerptIds.length > 0) {
    const notes = await prisma.meetingNote.findMany({
      where: { id: { in: missingExcerptIds } },
      select: { id: true, content: true },
    });
    // Straight out of the document, so it misses the masking pass that the
    // stored card body already went through on the way in.
    const byId = new Map(
      notes.map((n) => [n.id, maskPlainNames(plainTextExcerpt(n.content), aliasMap)]),
    );
    for (const m of messages) {
      if (
        m.noteActivity &&
        !m.noteActivity.excerpt &&
        noteCardShowsExcerpt(m.noteActivity.noteType)
      ) {
        const excerpt = byId.get(m.noteActivity.noteId);
        if (excerpt) m.noteActivity = { ...m.noteActivity, excerpt };
      }
    }
  }

  const unread = input.cursorId
    ? { lastReadAt: null, unreadCount: 0 }
    : await resolveThreadUnreadCursor(user.id, input, where);

  return { messages, hasMore, lastReadAt: unread.lastReadAt, unreadCount: unread.unreadCount };
}

export type ImportantMessageDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  threadId: string;
  threadName: string;
};

function threadIdForMessage(m: {
  conversationId: string | null;
  taskId: string | null;
  projectId: string | null;
}): string | null {
  if (m.conversationId) return `conv-${m.conversationId}`;
  if (m.taskId) return `task-${m.taskId}`;
  if (m.projectId) return `project-${m.projectId}`;
  return null;
}

async function userCanAccessMessage(
  user: { id: string; systemRole: string },
  message: {
    conversationId: string | null;
    projectId: string | null;
    taskId: string | null;
  },
): Promise<boolean> {
  if (message.conversationId) {
    const convo = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { kind: true },
    });
    if (!convo) return false;
    if (convo.kind === CLIENT_CONVERSATION_KIND) {
      const access = await canAccessClientConversation(
        message.conversationId,
        user,
      );
      return access.ok;
    }
    const part = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: message.conversationId,
        memberId: user.id,
      },
      select: { id: true },
    });
    return Boolean(part);
  }
  const projectId = message.projectId;
  if (!projectId) return false;
  if (isClientUser(user)) return false;
  return hasProjectAccess(projectId);
}

export async function toggleImportantMessage(
  messageId: string,
): Promise<{ ok: true; important: boolean } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        projectId: true,
        taskId: true,
      },
    });
    if (!message) return { ok: false, error: "Message not found" };
    if (!(await userCanAccessMessage(user, message))) {
      return { ok: false, error: "Permission denied" };
    }

    const existing = await prisma.importantMessage.findUnique({
      where: {
        messageId_userId: { messageId, userId: user.id },
      },
    });
    if (existing) {
      await prisma.importantMessage.delete({ where: { id: existing.id } });
      return { ok: true, important: false };
    }
    await prisma.importantMessage.create({
      data: { messageId, userId: user.id },
    });
    return { ok: true, important: true };
  } catch (err) {
    console.error("[toggleImportantMessage]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update",
    };
  }
}

export async function listImportantMessages(target?: {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
}): Promise<ImportantMessageDTO[]> {
  const user = await requireUser();

  const threadFilter = target?.conversationId
    ? { conversationId: target.conversationId }
    : target?.taskId
      ? { taskId: target.taskId }
      : target?.projectId
        ? { projectId: target.projectId, conversationId: null }
        : undefined;

  const rows = await prisma.importantMessage.findMany({
    where: {
      userId: user.id,
      ...(threadFilter ? { message: threadFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      message: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          conversationId: true,
          projectId: true,
          taskId: true,
          authorId: true,
          author: { select: { name: true, email: true } },
          project: { select: { name: true } },
          conversation: {
            select: {
              title: true,
              kind: true,
              projectId: true,
              project: { select: { name: true } },
            },
          },
          task: { select: { title: true, taskNumber: true } },
        },
      },
    },
  });

  const accessible = await filterAccessibleMessageIds(
    user,
    rows.map((r) => r.message),
  );

  const aliasMaps = isClientUser(user)
    ? await getAliasMapsForProjects(
        rows.map((r) => r.message.conversation?.projectId ?? r.message.projectId),
      )
    : new Map<string, Map<string, AliasIdentity>>();

  const out: ImportantMessageDTO[] = [];
  for (const row of rows) {
    const m = row.message;
    if (!accessible.has(m.id)) continue;
    const threadId = threadIdForMessage(m);
    if (!threadId) continue;
    const threadName = m.conversation
      ? (m.conversation.title ??
        m.conversation.project?.name ??
        m.project?.name ??
        "Chat")
      : m.task
        ? `#${m.task.taskNumber} ${m.task.title}`
        : (m.project?.name ?? "Chat");
    const projectId = m.conversation?.projectId ?? m.projectId;
    const aliasMap = (projectId && aliasMaps.get(projectId)) || NO_MASK;
    out.push({
      id: m.id,
      body: toDisplayBody(maskBody(m.body, aliasMap)),
      createdAt: m.createdAt.toISOString(),
      authorName: maskName(
        m.authorId,
        m.author.name ?? m.author.email ?? "Someone",
        aliasMap,
      ),
      threadId,
      threadName,
    });
  }
  return out;
}

async function filterAccessibleMessageIds(
  user: { id: string; systemRole: string },
  messages: Array<{
    id: string;
    conversationId: string | null;
    projectId: string | null;
    taskId: string | null;
  }>,
): Promise<Set<string>> {
  const convIds = [
    ...new Set(
      messages
        .map((m) => m.conversationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const projectIds = [
    ...new Set(
      messages
        .map((m) => m.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [parts, convos] = await Promise.all([
    convIds.length
      ? prisma.conversationParticipant.findMany({
          where: { memberId: user.id, conversationId: { in: convIds } },
          select: { conversationId: true },
        })
      : [],
    convIds.length
      ? prisma.conversation.findMany({
          where: { id: { in: convIds } },
          select: { id: true, kind: true },
        })
      : [],
  ]);
  const partSet = new Set(parts.map((p) => p.conversationId));
  const convoById = new Map(convos.map((c) => [c.id, c]));
  const client = isClientUser(user);

  const projectOk = new Map<string, boolean>();
  await Promise.all(
    projectIds.map(async (pid) => {
      projectOk.set(pid, client ? false : await hasProjectAccess(pid));
    }),
  );

  const clientOk = new Map<string, boolean>();
  const clientConvIds = convos
    .filter((c) => c.kind === CLIENT_CONVERSATION_KIND)
    .map((c) => c.id);
  await Promise.all(
    clientConvIds.map(async (id) => {
      const access = await canAccessClientConversation(id, user);
      clientOk.set(id, access.ok);
    }),
  );

  const allowed = new Set<string>();
  for (const m of messages) {
    if (m.conversationId) {
      const convo = convoById.get(m.conversationId);
      if (!convo) continue;
      if (convo.kind === CLIENT_CONVERSATION_KIND) {
        if (clientOk.get(m.conversationId)) allowed.add(m.id);
        continue;
      }
      if (convo.kind === ANNOUNCEMENTS_CONVERSATION_KIND) {
        if (!client) allowed.add(m.id);
        continue;
      }
      if (partSet.has(m.conversationId)) allowed.add(m.id);
      continue;
    }
    if (m.projectId && projectOk.get(m.projectId)) allowed.add(m.id);
  }
  return allowed;
}

// ─── Task references (# picker in project channels) ─────────────────────────

export type TaskPickerItem = {
  id: string;
  number: number;
  title: string;
  statusName: string | null;
  statusColor: string | null;
};

export async function getProjectTaskRefs(
  projectId: string,
): Promise<TaskPickerItem[]> {
  const user = await requireUser();
  if (isClientUser(user)) throw new Error("Permission denied");
  if (!(await hasProjectAccess(projectId))) throw new Error("Permission denied");

  const tasks = await prisma.task.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { taskNumber: "desc" },
    take: 100,
    select: { id: true, taskNumber: true, title: true, stage: true },
  });

  return tasks.map((t) => ({
    id: t.id,
    number: t.taskNumber,
    title: t.title,
    statusName: t.stage ? t.stage.replace(/_/g, " ") : null,
    statusColor: null,
  }));
}

// ─── Send ────────────────────────────────────────────────────────────────────

export async function sendMessage(
  input: SendMessageInput,
): Promise<ActionResult<MessageDTO>> {
  return safeAction("Send Message", async () => {
    const user = await requireUser();

    const body = input.body.trim();
    const attachmentsInput = input.attachments ?? [];
    if (!body && attachmentsInput.length === 0) {
      throw new Error("Message is empty");
    }

    let taskId = input.taskId ?? null;
    let projectId = input.projectId ?? null;
    const conversationId = input.conversationId ?? null;
    let taskTitle = "";
    let taskNumber = 0;
    let projectName = "";
    let projectLogoUrl: string | null = null;
    /** Group-conversation name for notification titles; "" for 1:1 DMs. */
    let groupName = "";
    let participantIds: string[] = [];
    let isClientRoom = false;
    /** Set only for announcement replies — narrows who gets notified. */
    let announcementReplyAuthorId: string | null = null;
    let noteCommentThreadId: string | null = null;
    let taskHighlightThreadId: string | null = null;
    let mentionProjectId: string | null = null;

    if (conversationId) {
      const convoMeta = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          kind: true,
          isGroup: true,
          title: true,
          projectId: true,
          participants: { select: { memberId: true } },
          project: { select: { name: true, logoUrl: true, clientChatEnabled: true } },
        },
      });
      if (!convoMeta) throw new Error("Conversation not found");

      if (convoMeta.kind === ANNOUNCEMENTS_CONVERSATION_KIND) {
        if (!canReadAnnouncements(user)) throw new Error("Conversation not found");
        if (input.replyToId) {
          const parent = await prisma.message.findFirst({
            where: { id: input.replyToId, conversationId },
            select: { id: true, authorId: true },
          });
          if (!parent) throw new Error("You can only reply inside this channel");
          // A reply is a conversation with the thread, not company-wide news:
          // it pings the author and anyone named, never all of staff.
          announcementReplyAuthorId = parent.authorId;
        } else if (!canPostAnnouncement(user)) {
          throw new Error(
            "Only admins can post announcements — you can reply to one.",
          );
        }
        participantIds = await announcementAudienceIds();
        if (!participantIds.includes(user.id)) participantIds.push(user.id);
        groupName = ANNOUNCEMENTS_TITLE;
        taskId = null;
        projectId = null;
      } else if (convoMeta.kind === CLIENT_CONVERSATION_KIND) {
        const access = await canAccessClientConversation(conversationId, user);
        if (!access.ok || !access.canPost) {
          throw new Error(
            access.ok
              ? "Client chat is disabled for this project"
              : "Conversation not found",
          );
        }
        isClientRoom = true;
        participantIds = convoMeta.participants.map((p) => p.memberId);
        // Ensure the sender is in the notify set even for admins without a row.
        if (!participantIds.includes(user.id)) participantIds.push(user.id);
        taskId = null;
        projectId = convoMeta.projectId;
        projectName = access.project?.name ?? convoMeta.project?.name ?? "Client chat";
        projectLogoUrl = access.project?.logoUrl ?? convoMeta.project?.logoUrl ?? null;
        groupName = `${projectName} · Client`;
      } else {
        const isParticipant = convoMeta.participants.some(
          (p) => p.memberId === user.id,
        );
        if (!isParticipant) throw new Error("Conversation not found");
        participantIds = convoMeta.participants.map((p) => p.memberId);
        if (convoMeta.isGroup) groupName = convoMeta.title || "Group chat";
        taskId = null;
        projectId = null;

        const noteThread = await prisma.noteCommentThread.findUnique({
          where: { conversationId },
          select: {
            id: true,
            note: { select: { projectId: true, title: true } },
          },
        });
        if (noteThread) {
          noteCommentThreadId = noteThread.id;
          mentionProjectId = noteThread.note.projectId;
          if (!groupName) groupName = convoMeta.title || noteThread.note.title;
          const extraIds = await resolveProjectMentionIds(body, mentionProjectId);
          const newIds = extraIds.filter((id) => !participantIds.includes(id));
          if (newIds.length > 0) {
            await prisma.conversationParticipant.createMany({
              data: newIds.map((memberId) => ({ conversationId, memberId })),
              skipDuplicates: true,
            });
            participantIds.push(...newIds);
          }
          if (extraIds.length > 0) {
            await prisma.noteCommentSubscriber.createMany({
              data: extraIds.map((userId) => ({
                threadId: noteThread.id,
                userId,
              })),
              skipDuplicates: true,
            });
          }
        } else {
          const taskThread = await prisma.taskHighlightThread.findUnique({
            where: { conversationId },
            select: {
              id: true,
              task: { select: { projectId: true, title: true } },
            },
          });
          if (taskThread) {
            taskHighlightThreadId = taskThread.id;
            mentionProjectId = taskThread.task.projectId;
            if (!groupName) groupName = convoMeta.title || taskThread.task.title;
            const extraIds = await resolveProjectMentionIds(body, mentionProjectId);
            const newIds = extraIds.filter((id) => !participantIds.includes(id));
            if (newIds.length > 0) {
              await prisma.conversationParticipant.createMany({
                data: newIds.map((memberId) => ({ conversationId, memberId })),
                skipDuplicates: true,
              });
              participantIds.push(...newIds);
            }
            if (extraIds.length > 0) {
              await prisma.taskHighlightSubscriber.createMany({
                data: extraIds.map((userId) => ({
                  threadId: taskThread.id,
                  userId,
                })),
                skipDuplicates: true,
              });
            }
          }
        }
      }
    } else if (taskId) {
      if (isClientUser(user)) throw new Error("Permission denied");
      const task = await prisma.task.findFirst({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          taskNumber: true,
          projectId: true,
          project: {
            select: {
              name: true,
              logoUrl: true,
              contracts: { select: CONTRACT_SELECT },
            },
          },
        },
      });
      if (!task) throw new Error("Task not found");
      if (!(await hasProjectAccess(task.projectId)))
        throw new Error("Permission denied");
      if (!getActiveContract(task.project.contracts))
        throw new Error("This project is not active");
      projectId = task.projectId;
      taskTitle = task.title;
      taskNumber = task.taskNumber;
      projectName = task.project.name;
      projectLogoUrl = task.project.logoUrl;
    } else if (projectId) {
      if (isClientUser(user)) throw new Error("Permission denied");
      if (!(await hasProjectAccess(projectId)))
        throw new Error("Permission denied");
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          name: true,
          logoUrl: true,
          contracts: { select: CONTRACT_SELECT },
        },
      });
      if (!project) throw new Error("Project not found");
      if (!getActiveContract(project.contracts))
        throw new Error("This project is not active");
      projectName = project.name;
      projectLogoUrl = project.logoUrl;
    } else {
      throw new Error("No thread specified");
    }

    let mentionedIds: string[];
    if (isClientRoom) {
      // Mentions resolve against room participants only (@all = everyone in room).
      const raw = body.match(/@\[([^\]]+)\]\(([^)]+)\)/g) ?? [];
      const ids = new Set<string>();
      for (const token of raw) {
        const m = /@\[([^\]]+)\]\(([^)]+)\)/.exec(token);
        if (!m) continue;
        if (m[2] === ALL_MENTION_ID) {
          for (const id of participantIds) ids.add(id);
        } else if (participantIds.includes(m[2])) {
          ids.add(m[2]);
        }
      }
      mentionedIds = [...ids];
    } else {
      mentionedIds = await resolveProjectMentionIds(
        body,
        mentionProjectId ?? projectId,
      );
    }

    const message = await prisma.message.create({
      data: {
        taskId,
        projectId,
        conversationId,
        replyToId: input.replyToId ?? null,
        authorId: user.id,
        body,
        kind: input.kind ?? "message",
        mentions: mentionedIds.length
          ? { create: mentionedIds.map((id) => ({ memberId: id })) }
          : undefined,
        attachments: attachmentsInput.length
          ? {
              create: attachmentsInput.map((a) => ({
                filename: a.filename,
                url: a.url,
                fileSize: a.fileSize ?? null,
                mimeType: a.mimeType ?? null,
              })),
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, email: true, imageUrl: true } },
        attachments: {
          select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
        },
      },
    });

    const attachments: MessageAttachment[] = message.attachments.map((a) => ({
      id: a.id,
      name: a.filename,
      url: a.url,
      contentType: a.mimeType,
      sizeBytes: a.fileSize,
      isImage: isImageType(a.mimeType),
    }));

    const authorName = message.author.name ?? message.author.email ?? "Someone";
    const noteCommentPayload = isNoteCommentMessage(message.kind)
      ? decodeNoteCommentPayload(body)
      : null;
    const taskCommentPayload = isTaskCommentMessage(message.kind)
      ? decodeTaskCommentPayload(body)
      : null;
    const noteActivityPayload = isNoteActivityMessage(message.kind)
      ? decodeNoteActivityPayload(body)
      : null;
    const proofBypassPayload = isProofBypassMessage(message.kind)
      ? decodeProofBypassPayload(body)
      : null;
    const highlightPayload = noteCommentPayload ?? taskCommentPayload;
    const display = highlightPayload
      ? highlightPayload.comment
      : noteActivityPayload
        ? noteActivityPreview(noteActivityPayload)
        : proofBypassPayload
          ? proofBypassPreview(proofBypassPayload)
          : toDisplayBody(body);
    const previewText =
      (noteCommentPayload
        ? noteCommentPreview(noteCommentPayload)
        : taskCommentPayload
          ? taskCommentPreview(taskCommentPayload)
          : noteActivityPayload
            ? noteActivityPreview(noteActivityPayload)
            : proofBypassPayload
              ? proofBypassPreview(proofBypassPayload)
              : display) || (attachments.length > 0 ? `📎 ${attachments[0].name}` : "");
    const preview =
      previewText.length > 80 ? previewText.slice(0, 80) + "…" : previewText;

    if (noteCommentThreadId) {
      await prisma.noteComment.create({
        data: {
          threadId: noteCommentThreadId,
          userId: user.id,
          content: display,
          messageId: message.id,
          ...(mentionedIds.length
            ? {
                mentions: {
                  create: mentionedIds.map((id) => ({ userId: id })),
                },
              }
            : {}),
        },
      });
    }

    if (taskHighlightThreadId) {
      await prisma.taskHighlightComment.create({
        data: {
          threadId: taskHighlightThreadId,
          userId: user.id,
          content: display,
          messageId: message.id,
          ...(mentionedIds.length
            ? {
                mentions: {
                  create: mentionedIds.map((id) => ({ userId: id })),
                },
              }
            : {}),
        },
      });
    }

    const dto: MessageDTO = {
      id: message.id,
      taskId,
      projectId,
      conversationId,
      kind: message.kind,
      authorId: user.id,
      authorName,
      authorImageUrl: message.author.imageUrl ?? null,
      body: display,
      createdAt: message.createdAt.toISOString(),
      attachments,
      replyToId: input.replyToId ?? null,
      task:
        taskId && projectId
          ? { id: taskId, projectId, number: taskNumber, title: taskTitle }
          : null,
      mentions: parseMentionNames(body),
      noteComment: noteCommentPayload,
      taskComment: taskCommentPayload,
      noteActivity: noteActivityPayload,
      proofBypass: proofBypassPayload,
    };

    // Recipients + notification (mention-driven; DMs notify all participants).
    let url: string;
    let threadId: string;
    let recipients: string[];
    if (conversationId) {
      url = `/dashboard/messages/conv-${conversationId}`;
      threadId = `conv-${conversationId}`;
      recipients = announcementReplyAuthorId
        ? [...new Set([announcementReplyAuthorId, ...mentionedIds])].filter(
            (id) => id !== user.id,
          )
        : participantIds.filter((id) => id !== user.id);
    } else if (taskId) {
      url = `/dashboard/projects/${projectId}/tasks/${taskId}`;
      threadId = `task-${taskId}`;
      recipients = mentionedIds.filter((id) => id !== user.id);
    } else {
      url = `/dashboard/messages/project-${projectId}`;
      threadId = `project-${projectId}`;
      recipients = mentionedIds.filter((id) => id !== user.id);
    }

    const notifyType =
      input.kind === "rejection"
        ? "rejection"
        : conversationId
          ? "message"
          : "mention";
    // Where the message came from, right in the OS banner: the group name, an
    // explicit "Direct message", or the task's project. Kept short — iOS
    // truncates banner titles around 30 characters, so anything appended after
    // "mentioned you in …" was never visible. Author first, context right
    // after, and the task name moves into the body (which gets two lines).
    const title = conversationId
      ? `${authorName} · ${groupName || "Direct message"}`
      : input.kind === "rejection"
        ? `${authorName} declined "${taskTitle}"`
        : `${authorName} · ${projectName}`;
    const notifBody =
      taskTitle && input.kind !== "rejection"
        ? `"${taskTitle}" — ${preview}`
        : preview;
    // DMs and groups show the sender's face; project threads show the project
    // logo. The service worker falls back to the app icon when neither exists.
    // This is the staff-facing icon — notifyAndPush substitutes the alias photo
    // for any client recipient.
    const notifIcon =
      (isClientRoom
        ? (projectLogoUrl ?? message.author.imageUrl)
        : conversationId
          ? message.author.imageUrl
          : (projectLogoUrl ?? message.author.imageUrl)) ?? undefined;

    const uniqueRecipients = [...new Set(recipients)];

    // Live delivery first so the sender sees their own bubble without waiting
    // on notifications / unread cursors.
    const threadChannels: string[] = [];
    if (taskId) threadChannels.push(taskChannel(taskId));
    if (projectId && !conversationId) threadChannels.push(projectChannel(projectId));
    if (conversationId) threadChannels.push(conversationChannel(conversationId));
    void broadcast(threadChannels, { type: "message.new", message: dto });

    // Clients read a separate channel carrying the aliased payload, so the real
    // name is never published anywhere a client can subscribe. Always publish,
    // even with no aliases assigned, or client chat would go silent.
    if (conversationId) {
      const aliasMap = await getAliasMap(projectId);
      void publish(conversationClientChannel(conversationId), {
        type: "message.new",
        message: maskMessageDTO(dto, aliasMap),
      });
    }

    after(() => {
      void fanOutMessageSideEffects({
        conversationId,
        projectId,
        taskId,
        userId: user.id,
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
        messageCreatedAt: message.createdAt,
      }).catch((err) => {
        console.error("[Send Message] fan-out failed", err);
      });
    });

    if (isClientUser(user)) {
      return maskMessageDTO(dto, await getAliasMap(projectId));
    }
    return dto;
  });
}

/**
 * Live "is typing…" for a chat channel. Published from the server so it works
 * even when the browser cannot publish on the Centrifugo subscription
 * (client rooms often fail that path). skip_history so it never replays.
 */
export async function publishTypingEvent(channel: string): Promise<void> {
  const user = await requireUser();
  const trimmed = channel.trim();
  if (!trimmed) return;

  const idx = trimmed.indexOf(":");
  if (idx === -1) return;
  const namespace = trimmed.slice(0, idx);
  const rest = trimmed.slice(idx + 1);
  if (!rest) return;

  const extraUserChannels: string[] = [];

  if (namespace === "conv") {
    // Clients type on the "-client" twin of the channel; resolve back to the
    // conversation and fan out to both audiences so each sees the other typing.
    const conversationId = rest.endsWith(CLIENT_CHANNEL_SUFFIX)
      ? rest.slice(0, -CLIENT_CHANNEL_SUFFIX.length)
      : rest;
    if (!conversationId) return;

    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        kind: true,
        participants: {
          select: { memberId: true, member: { select: { systemRole: true } } },
        },
      },
    });
    if (!convo) return;
    if (convo.kind === CLIENT_CONVERSATION_KIND) {
      const access = await canAccessClientConversation(conversationId, user);
      if (!access.ok || !access.canPost) return;
    } else if (!convo.participants.some((p) => p.memberId === user.id)) {
      return;
    }

    const others = convo.participants.filter((p) => p.memberId !== user.id);
    const staffChannel = conversationChannel(conversationId);
    const clientChannel = conversationClientChannel(conversationId);

    // The `channel` field must match whichever channel the recipient is
    // subscribed to, or their typing hook filters the event out.
    await Promise.all([
      broadcastEphemeral(
        [
          staffChannel,
          ...others
            .filter((p) => !isClientUser(p.member))
            .map((p) => userChannel(p.memberId)),
        ],
        { type: TYPING_EVENT, memberId: user.id, channel: staffChannel },
      ),
      broadcastEphemeral(
        [
          clientChannel,
          ...others
            .filter((p) => isClientUser(p.member))
            .map((p) => userChannel(p.memberId)),
        ],
        { type: TYPING_EVENT, memberId: user.id, channel: clientChannel },
      ),
    ]);
    return;
  } else if (namespace === "project") {
    if (isClientUser(user)) return;
    if (!(await hasProjectAccess(rest))) return;
  } else if (namespace === "task") {
    if (isClientUser(user)) return;
    const task = await prisma.task.findFirst({
      where: { id: rest },
      select: { projectId: true },
    });
    if (!task || !(await hasProjectAccess(task.projectId))) return;
  } else {
    return;
  }

  await broadcastEphemeral(
    [trimmed, ...extraUserChannels],
    { type: TYPING_EVENT, memberId: user.id, channel: trimmed },
  );
}

// ─── Read state ───────────────────────────────────────────────────────────────

/**
 * Marks a thread's notifications as read. Deliberately a client-initiated
 * action rather than a side effect of rendering the thread page: Next.js
 * prefetches thread pages from the inbox list, and a prefetch must never count
 * as reading. The client calls this only while the thread is actually visible
 * (and again when messages arrive while the user is watching).
 */
export async function markThreadRead(target: {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
}): Promise<{ unread: number; inboxUnread: number } | void> {
  const user = await requireUser();

  const linkUrl = target.conversationId
    ? `/dashboard/messages/conv-${target.conversationId}`
    : target.taskId
      ? `/dashboard/projects/${target.projectId}/tasks/${target.taskId}`
      : target.projectId
        ? `/dashboard/messages/project-${target.projectId}`
        : null;
  if (!linkUrl) return;

  const now = new Date();

  const inboxThreadId = target.conversationId
    ? `conv-${target.conversationId}`
    : target.projectId && !target.taskId
      ? `project-${target.projectId}`
      : null;
  if (inboxThreadId) {
    await prisma.chatReadCursor.upsert({
      where: {
        userId_threadId: { userId: user.id, threadId: inboxThreadId },
      },
      create: {
        userId: user.id,
        threadId: inboxThreadId,
        lastReadAt: now,
      },
      update: { lastReadAt: now },
    });
  }

  // DMs: advance lastReadAt so senders can show read receipts.
  if (target.conversationId) {
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: target.conversationId, memberId: user.id },
      data: { lastReadAt: now },
    });
    void broadcast(conversationChannelsFor(target.conversationId), {
      type: "thread.read",
      memberId: user.id,
      lastReadAt: now.toISOString(),
    });
  }

  // Only the caller's own notification rows are touched, so no further access
  // checks are needed. Always publish even when there are no rows — other tabs
  // still need the lastReadAt-driven inbox count.
  const toMark = await prisma.notification.findMany({
    where: { recipientId: user.id, read: false, linkUrl },
    select: { id: true, tag: true },
  });
  if (toMark.length > 0) {
    await prisma.notification.updateMany({
      where: { recipientId: user.id, read: false, linkUrl },
      data: { read: true, readAt: now },
    });
  }
  const { unread, inboxUnread } = await unreadCountsFor(user.id);
  const pushTag = threadPushTag(target);
  const tags = [
    ...new Set(
      [
        ...toMark.map((n) => n.tag),
        pushTag,
      ].filter((t): t is string => !!t),
    ),
  ];
  // Sync read-state to the user's other devices/tabs (bell + app badge +
  // inbox list) and let them close the matching OS push banners by tag.
  void publish(userChannel(user.id), {
    type: NOTIFICATION_READ,
    ids: toMark.map((n) => n.id),
    tags,
    linkUrls: [linkUrl],
    unread,
    inboxUnread,
  });
  return { unread, inboxUnread };
}

/** Sum of unread messages across inbox threads. */
export async function getInboxUnreadCount(): Promise<number> {
  const user = await requireUser();
  return sumInboxMessageUnreads(user.id);
}

/**
 * Edit own message body (within a reasonable window). Sets updatedAt via Prisma.
 */
export async function editMessage(
  messageId: string,
  body: string,
): Promise<ActionResult<{ id: string; body: string; updatedAt: string }>> {
  return safeAction("Edit message", async () => {
    const user = await requireUser();
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Message cannot be empty");

    const message = await prisma.message.findFirst({
      where: { id: messageId },
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        conversationId: true,
        projectId: true,
        taskId: true,
        kind: true,
        conversation: { select: { projectId: true } },
      },
    });
    if (!message) throw new Error("Message not found");
    if (message.authorId !== user.id)
      throw new Error("You can only edit your own messages");
    if (message.kind !== "message")
      throw new Error("This message cannot be edited");
    const ageMs = Date.now() - message.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000)
      throw new Error("Messages can only be edited within 24 hours");

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { body: trimmed },
      select: { id: true, body: true, updatedAt: true },
    });

    const channels: string[] = [];
    if (message.taskId) channels.push(taskChannel(message.taskId));
    if (message.projectId) channels.push(projectChannel(message.projectId));
    if (message.conversationId)
      channels.push(conversationChannel(message.conversationId));
    void broadcast(channels, {
      type: "message.updated",
      messageId: updated.id,
      body: toDisplayBody(updated.body),
      updatedAt: updated.updatedAt.toISOString(),
      edited: true,
    });

    // The edited body may name someone, so the client channel gets its own copy.
    let clientBody: string | null = null;
    if (message.conversationId) {
      const aliasMap = await getAliasMap(
        message.conversation?.projectId ?? message.projectId,
      );
      clientBody = toDisplayBody(maskBody(updated.body, aliasMap));
      void publish(conversationClientChannel(message.conversationId), {
        type: "message.updated",
        messageId: updated.id,
        body: clientBody,
        updatedAt: updated.updatedAt.toISOString(),
        edited: true,
      });
    }

    // The editor reads this response straight back into their own bubble, so a
    // client has to be handed the same copy their channel just received.
    return {
      id: updated.id,
      body:
        clientBody !== null && isClientUser(user)
          ? clientBody
          : toDisplayBody(updated.body),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult<{ messageId: string; reactions: ReactionSummary[] }>> {
  return safeAction("React", async () => {
    const user = await requireUser();

    if (!ALLOWED_EMOJIS.includes(emoji)) throw new Error("Invalid reaction");

    const message = await prisma.message.findFirst({
      where: { id: messageId },
      select: { id: true, taskId: true, projectId: true, conversationId: true },
    });
    if (!message) throw new Error("Message not found");

    if (message.conversationId === ANNOUNCEMENTS_CONVERSATION_ID) {
      // No participant rows here — membership is every non-client user.
      if (!canReadAnnouncements(user)) throw new Error("Permission denied");
    } else if (message.conversationId) {
      const convo = await prisma.conversation.findFirst({
        where: {
          id: message.conversationId,
          participants: { some: { memberId: user.id } },
        },
        select: { id: true },
      });
      if (!convo) throw new Error("Permission denied");
    } else if (message.projectId) {
      if (!(await hasProjectAccess(message.projectId)))
        throw new Error("Permission denied");
    } else {
      throw new Error("Permission denied");
    }

    const existing = await prisma.messageReaction.findUnique({
      where: {
        messageId_memberId_emoji: { messageId, memberId: user.id, emoji },
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.messageReaction.create({
        data: { messageId, memberId: user.id, emoji },
      });
    }

    const all = await prisma.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, memberId: true },
      orderBy: { createdAt: "asc" },
    });
    const byEmoji = new Map<string, string[]>();
    for (const r of all) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.memberId);
      byEmoji.set(r.emoji, list);
    }
    const reactions: ReactionSummary[] = [...byEmoji.entries()].map(
      ([e, memberIds]) => ({ emoji: e, memberIds }),
    );

    const channels: string[] = [];
    if (message.taskId) channels.push(taskChannel(message.taskId));
    if (message.projectId) channels.push(projectChannel(message.projectId));
    if (message.conversationId)
      channels.push(...conversationChannelsFor(message.conversationId));
    void broadcast(channels, { type: "reaction.updated", messageId, reactions });

    return { messageId, reactions };
  });
}

export async function deleteMessage(
  messageId: string,
): Promise<ActionResult<void>> {
  return safeAction("Delete message", async () => {
    const user = await requireUser();

    const message = await prisma.message.findFirst({
      where: { id: messageId },
      select: {
        id: true,
        authorId: true,
        conversationId: true,
        projectId: true,
        taskId: true,
      },
    });
    if (!message) throw new Error("Message not found");
    if (message.authorId !== user.id)
      throw new Error("You can only delete your own messages");

    await prisma.message.delete({ where: { id: message.id } });

    const channels: string[] = [];
    if (message.taskId) channels.push(taskChannel(message.taskId));
    if (message.projectId) channels.push(projectChannel(message.projectId));
    if (message.conversationId)
      channels.push(...conversationChannelsFor(message.conversationId));
    void broadcast(channels, { type: "message.deleted", messageId: message.id });
  });
}

// ─── Inbox ─────────────────────────────────────────────────────────────────

export type InboxThread = {
  id: string; // project-<id> | conv-<id>
  kind: "project" | "direct" | "client" | "announcements";
  name: string;
  subtitle: string;
  projectId: string | null;
  conversationId: string | null;
  logoUrl: string | null;
  peerImageUrl: string | null;
  peerMemberIds: string[];
  lastMessage: string;
  lastAuthor: string;
  lastAt: string;
  unread: number;
  avatar: string;
  initials: string;
  inactive: boolean;
};

export async function getInboxThreads(): Promise<InboxThread[]> {
  const user = await requireUser();
  const isAdmin = user.systemRole === "ADMIN";
  const client = isClientUser(user);

  const unreadMap = await countInboxMessageUnreads(user.id);

  // Clients only see enabled client rooms they participate in.
  if (client) {
    const loadClientConversations = () =>
      prisma.conversation.findMany({
        where: {
          kind: CLIENT_CONVERSATION_KIND,
          participants: { some: { memberId: user.id } },
          project: { clientChatEnabled: true },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              clientChatEnabled: true,
              contracts: { select: CONTRACT_SELECT },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { author: { select: { id: true, name: true, email: true } } },
          },
        },
      });

    let conversations = await loadClientConversations();
    if (conversations.length === 0) {
      await ensureClientInbox(user.id);
      conversations = await loadClientConversations();
    }

    const aliasMaps = await getAliasMapsForProjects(
      conversations.map((c) => c.project?.id),
    );

    return conversations.map((c) => {
      const last = c.messages[0];
      const name = c.project?.name ?? c.title ?? "Client chat";
      const aliasMap =
        (c.project?.id && aliasMaps.get(c.project.id)) || NO_MASK;
      return {
        id: `conv-${c.id}`,
        kind: "client" as const,
        name,
        subtitle: "Chatting with Nizek",
        projectId: c.project?.id ?? null,
        conversationId: c.id,
        logoUrl: c.project?.logoUrl ?? null,
        peerImageUrl: null,
        peerMemberIds: [],
        lastMessage: last ? inboxPreview(maskBody(last.body, aliasMap)) : "",
        lastAuthor: last
          ? maskName(last.author.id, last.author.name ?? last.author.email, aliasMap)
          : "",
        lastAt: last ? last.createdAt.toISOString() : "",
        unread: unreadMap.get(`conv-${c.id}`) ?? 0,
        avatar: generateColor(name),
        initials: name.charAt(0).toUpperCase(),
        inactive: c.project ? !getActiveContract(c.project.contracts) : false,
      };
    });
  }

  const projectWhere = isAdmin
    ? {}
    : { members: { some: { userId: user.id } } };

  const [projects, clientConversations, noteCommentConversations, dmConversations] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        contracts: { select: CONTRACT_SELECT },
        messages: {
          where: { conversationId: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.conversation.findMany({
      where: {
        kind: CLIENT_CONVERSATION_KIND,
        OR: [
          { participants: { some: { memberId: user.id } } },
          ...(isAdmin ? [{ projectId: { not: null } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            clientChatEnabled: true,
            contracts: { select: CONTRACT_SELECT },
            members: isAdmin
              ? { where: { userId: user.id }, select: { id: true } }
              : false,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.conversation.findMany({
      where: {
        OR: [
          { noteCommentThread: { isNot: null } },
          { taskHighlightThread: { isNot: null } },
        ],
        participants: { some: { memberId: user.id } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        noteCommentThread: {
          select: {
            note: {
              select: {
                title: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        taskHighlightThread: {
          select: {
            task: {
              select: {
                title: true,
                projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { id: true, name: true, email: true } } },
        },
        participants: {
          select: { memberId: true, member: { select: { imageUrl: true } } },
        },
      },
    }),
    prisma.conversation.findMany({
      where: {
        kind: "direct",
        isGroup: false,
        projectId: null,
        noteCommentThread: null,
        taskHighlightThread: null,
        participants: { some: { memberId: user.id } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { id: true, name: true, email: true } } },
        },
        participants: {
          select: {
            memberId: true,
            member: { select: { name: true, email: true, imageUrl: true } },
          },
        },
      },
    }),
  ]);

  const projectThreads: InboxThread[] = projects.map((p) => {
    const last = p.messages[0];
    const unread = unreadMap.get(`project-${p.id}`) ?? 0;
    return {
      id: `project-${p.id}`,
      kind: "project" as const,
      name: p.name,
      subtitle: "Project chat",
      projectId: p.id,
      conversationId: null,
      logoUrl: p.logoUrl ?? null,
      peerImageUrl: null,
      peerMemberIds: [],
      lastMessage: last ? inboxPreview(last.body) : "",
      lastAuthor: last ? (last.author.name ?? last.author.email) : "",
      lastAt: last ? last.createdAt.toISOString() : "",
      unread,
      avatar: generateColor(p.name),
      initials: p.name.charAt(0).toUpperCase(),
      inactive: !getActiveContract(p.contracts),
    };
  });

  // One group chat per project (+ optional client room). No inbox DMs.
  const clientThreads: InboxThread[] = clientConversations
    .filter((c) => {
      if (!c.project) return false;
      return true;
    })
    .map((c) => {
      const last = c.messages[0];
      const name = c.project!.name;
      const enabled = c.project!.clientChatEnabled;
      return {
        id: `conv-${c.id}`,
        kind: "client" as const,
        name,
        subtitle: enabled ? "Client chat" : "Client chat (disabled)",
        projectId: c.project!.id,
        conversationId: c.id,
        logoUrl: c.project!.logoUrl ?? null,
        peerImageUrl: null,
        peerMemberIds: [],
        lastMessage: last ? inboxPreview(last.body) : "",
        lastAuthor: last ? (last.author.name ?? last.author.email) : "",
        lastAt: last ? last.createdAt.toISOString() : "",
        unread: unreadMap.get(`conv-${c.id}`) ?? 0,
        avatar: generateColor(name),
        initials: name.charAt(0).toUpperCase(),
        inactive: !enabled || !getActiveContract(c.project!.contracts),
      };
    });

  const noteCommentThreads: InboxThread[] = noteCommentConversations.map((c) => {
    const last = c.messages[0];
    const note = c.noteCommentThread?.note;
    const task = c.taskHighlightThread?.task;
    const isTask = Boolean(task) && !note;
    const name = note?.title ?? task?.title ?? c.title ?? (isTask ? "Task comment" : "Note comment");
    const notePayload = last ? decodeNoteCommentPayload(last.body) : null;
    const taskPayload = last ? decodeTaskCommentPayload(last.body) : null;
    const bypassPayload = last ? decodeProofBypassPayload(last.body) : null;
    const isBypass = Boolean(bypassPayload) && !note && !task;
    const lastBody = notePayload
      ? notePayload.comment
      : taskPayload
        ? taskPayload.comment
        : bypassPayload
          ? proofBypassPreview(bypassPayload)
          : last
            ? inboxPreview(last.body)
            : "";
    const peer = c.participants.find((p) => p.memberId !== user.id);
    const projectName = note?.project.name ?? task?.project.name ?? bypassPayload?.projectName;
    const projectId = note?.project.id ?? task?.project.id ?? task?.projectId ?? bypassPayload?.projectId ?? null;
    const threadLabel = isBypass ? "Video bypass" : isTask ? "Task comment" : "Note comment";
    return {
      id: `conv-${c.id}`,
      kind: "direct" as const,
      name: isBypass ? (bypassPayload?.taskTitle ?? c.title ?? "Video bypass") : name,
      subtitle: projectName ? `${projectName} · ${threadLabel}` : threadLabel,
      projectId,
      conversationId: c.id,
      logoUrl: null,
      peerImageUrl: peer?.member.imageUrl ?? null,
      peerMemberIds: c.participants
        .map((p) => p.memberId)
        .filter((id) => id !== user.id),
      lastMessage: lastBody,
      lastAuthor: last ? (last.author.name ?? last.author.email) : "",
      lastAt: last ? last.createdAt.toISOString() : "",
      unread: unreadMap.get(`conv-${c.id}`) ?? 0,
      avatar: generateColor(name),
      initials: name.charAt(0).toUpperCase(),
      inactive: false,
    };
  });

  const dmThreads: InboxThread[] = dmConversations.map((c) => {
    const last = c.messages[0];
    const peer = c.participants.find((p) => p.memberId !== user.id);
    const peerName = peer?.member.name ?? peer?.member.email ?? "Direct message";
    return {
      id: `conv-${c.id}`,
      kind: "direct" as const,
      name: peerName,
      subtitle: "Direct message",
      projectId: null,
      conversationId: c.id,
      logoUrl: null,
      peerImageUrl: peer?.member.imageUrl ?? null,
      peerMemberIds: c.participants
        .map((p) => p.memberId)
        .filter((id) => id !== user.id),
      lastMessage: last ? inboxPreview(last.body) : "",
      lastAuthor: last ? (last.author.name ?? last.author.email) : "",
      lastAt: last ? last.createdAt.toISOString() : "",
      unread: unreadMap.get(`conv-${c.id}`) ?? 0,
      avatar: generateColor(peerName),
      initials: peerName.charAt(0).toUpperCase(),
      inactive: false,
    };
  });

  const noteConvIds = new Set(noteCommentConversations.map((c) => c.id));
  const uniqueDmThreads = dmThreads.filter((t) => !noteConvIds.has(t.conversationId!));

  const sorted = [
    ...projectThreads,
    ...clientThreads,
    ...noteCommentThreads,
    ...uniqueDmThreads,
  ].sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return tb - ta;
  });

  // Pinned: stays first no matter how long since the last announcement.
  return [await buildAnnouncementsThread(unreadMap), ...sorted];
}

async function buildAnnouncementsThread(
  unreadMap: Map<string, number>,
): Promise<InboxThread> {
  const [, last] = await Promise.all([
    getOrCreateAnnouncementsConversation(),
    prisma.message.findFirst({
      where: { conversationId: ANNOUNCEMENTS_CONVERSATION_ID },
      orderBy: { createdAt: "desc" },
      select: {
        body: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
  ]);

  return {
    id: ANNOUNCEMENTS_THREAD_ID,
    kind: "announcements",
    name: ANNOUNCEMENTS_TITLE,
    subtitle: ANNOUNCEMENTS_SUBTITLE,
    projectId: null,
    conversationId: ANNOUNCEMENTS_CONVERSATION_ID,
    logoUrl: null,
    peerImageUrl: null,
    peerMemberIds: [],
    lastMessage: last ? inboxPreview(last.body) : "No announcements yet",
    lastAuthor: last ? (last.author.name ?? last.author.email) : "",
    lastAt: last ? last.createdAt.toISOString() : "",
    unread: unreadMap.get(ANNOUNCEMENTS_THREAD_ID) ?? 0,
    avatar: generateColor(ANNOUNCEMENTS_TITLE),
    initials: "A",
    inactive: false,
  };
}

// ─── Direct conversations ─────────────────────────────────────────────────────

export async function getOrCreateDirectConversation(
  otherMemberId: string,
): Promise<ActionResult<string>> {
  return safeAction("Open Conversation", async () => {
    const user = await requireUser();
    if (otherMemberId === user.id) throw new Error("Cannot message yourself");

    const other = await prisma.user.findUnique({
      where: { id: otherMemberId },
      select: { id: true, blocked: true },
    });
    if (!other || other.blocked) throw new Error("User not found");

    const existing = await prisma.conversation.findFirst({
      where: {
        kind: "direct",
        isGroup: false,
        projectId: null,
        noteCommentThread: null,
        taskHighlightThread: null,
        participants: { every: { memberId: { in: [user.id, otherMemberId] } } },
        AND: [
          { participants: { some: { memberId: user.id } } },
          { participants: { some: { memberId: otherMemberId } } },
        ],
      },
      select: { id: true, participants: { select: { memberId: true } } },
    });

    if (existing && existing.participants.length === 2) {
      return `conv-${existing.id}`;
    }

    const conv = await prisma.conversation.create({
      data: {
        kind: "direct",
        isGroup: false,
        participants: {
          createMany: {
            data: [{ memberId: user.id }, { memberId: otherMemberId }],
          },
        },
      },
      select: { id: true },
    });

    revalidatePath("/dashboard/messages");

    return `conv-${conv.id}`;
  });
}

export async function getMessageableMembers() {
  const user = await requireUser();
  // Clients cannot start new threads, and this list is a directory of real
  // staff names — never hand it to them, even by a direct action call.
  if (isClientUser(user)) return [];
  return prisma.user.findMany({
    where: {
      id: { not: user.id },
      blocked: false,
      systemRole: { not: "CLIENT" },
    },
    select: { id: true, name: true, email: true, imageUrl: true },
    orderBy: { name: "asc" },
  });
}

const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899",
  "#0ea5e9", "#a855f7", "#f97316", "#14b8a6",
];

function generateColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
