"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import { getActiveContract } from "@/lib/contract-rules";
import { sendPush } from "@/lib/push";
import { createAndPublishNotifications } from "@/lib/notify";
import {
  broadcast,
  taskChannel,
  projectChannel,
  conversationChannel,
  userChannel,
} from "@/lib/centrifugo";

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
// creates Notification rows (inbox unread), and publishes live via Centrifugo.
// Identity everywhere is User.id.

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

const THREAD_PAGE_SIZE = 50;

export type ThreadMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string | null;
  body: string;
  createdAt: string;
  replyToId: string | null;
  attachments: MessageAttachment[];
  reactions: ReactionSummary[];
  kind: string;
  task: MessageTaskRef | null;
  mentions: string[];
};

export type ThreadMessagesPage = {
  messages: ThreadMessage[]; // oldest → newest
  hasMore: boolean;
};

export async function getThreadMessages(input: {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  cursorId?: string;
}): Promise<ThreadMessagesPage> {
  const user = await requireUser();

  let where: { taskId?: string; projectId?: string; conversationId?: string };
  if (input.conversationId) {
    const convo = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        participants: { some: { memberId: user.id } },
      },
      select: { id: true },
    });
    if (!convo) throw new Error("Permission denied");
    where = { conversationId: input.conversationId };
  } else if (input.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: input.taskId },
      select: { projectId: true },
    });
    if (!task) throw new Error("Not found");
    if (!(await hasProjectAccess(task.projectId)))
      throw new Error("Permission denied");
    where = { taskId: input.taskId };
  } else if (input.projectId) {
    if (!(await hasProjectAccess(input.projectId)))
      throw new Error("Permission denied");
    where = { projectId: input.projectId };
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

  const messages: ThreadMessage[] = page.map((c) => {
    const byEmoji = new Map<string, string[]>();
    for (const r of c.reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.memberId);
      byEmoji.set(r.emoji, list);
    }
    return {
      id: c.id,
      authorId: c.authorId,
      authorName: c.author.name ?? c.author.email,
      authorImageUrl: c.author.imageUrl ?? null,
      body: toDisplayBody(c.body),
      createdAt: c.createdAt.toISOString(),
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
      mentions: parseMentionNames(c.body),
    };
  });

  return { messages, hasMore };
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
    let participantIds: string[] = [];

    if (conversationId) {
      const convo = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { memberId: user.id } },
        },
        include: { participants: { select: { memberId: true } } },
      });
      if (!convo) throw new Error("Conversation not found");
      participantIds = convo.participants.map((p) => p.memberId);
      taskId = null;
      projectId = null;
    } else if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          taskNumber: true,
          projectId: true,
          project: {
            select: { name: true, contracts: { select: CONTRACT_SELECT } },
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
    } else if (projectId) {
      if (!(await hasProjectAccess(projectId)))
        throw new Error("Permission denied");
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, contracts: { select: CONTRACT_SELECT } },
      });
      if (!project) throw new Error("Project not found");
      if (!getActiveContract(project.contracts))
        throw new Error("This project is not active");
      projectName = project.name;
    } else {
      throw new Error("No thread specified");
    }

    const mentionedIds = parseMentions(body);

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
    const display = toDisplayBody(body);
    const previewText =
      display || (attachments.length > 0 ? `📎 ${attachments[0].name}` : "");
    const preview =
      previewText.length > 80 ? previewText.slice(0, 80) + "…" : previewText;

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
    };

    // Recipients + notification (mention-driven; DMs notify all participants).
    let url: string;
    let threadId: string;
    let recipients: string[];
    if (conversationId) {
      url = `/dashboard/messages/conv-${conversationId}`;
      threadId = `conv-${conversationId}`;
      recipients = participantIds.filter((id) => id !== user.id);
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
    const title = conversationId
      ? authorName
      : input.kind === "rejection"
        ? `${authorName} declined "${taskTitle}"`
        : `${authorName} mentioned you${taskTitle ? ` in "${taskTitle}"` : projectName ? ` in ${projectName}` : ""}`;

    const uniqueRecipients = [...new Set(recipients)];
    if (uniqueRecipients.length > 0) {
      // Create rows + publish per-recipient `notification.new` so bells update
      // live without a refetch.
      await createAndPublishNotifications({
        recipientIds: uniqueRecipients,
        type: notifyType,
        title,
        body: preview,
        linkUrl: url,
      });
      // OS-level web push on top of the in-app bell.
      void sendPush(uniqueRecipients, {
        title,
        body: preview,
        url,
        tag: `msg-${message.id}`,
      });
    }

    // Live delivery: thread channels for open views, user channels for inbox.
    const threadChannels: string[] = [];
    if (taskId) threadChannels.push(taskChannel(taskId));
    if (projectId) threadChannels.push(projectChannel(projectId));
    if (conversationId) threadChannels.push(conversationChannel(conversationId));
    void broadcast(threadChannels, { type: "message.new", message: dto });

    const inboxTargets = conversationId
      ? participantIds
      : [...uniqueRecipients, user.id];
    void broadcast([...new Set(inboxTargets)].map(userChannel), {
      type: "inbox",
      threadId,
      projectId,
      taskId,
      conversationId,
      // Delta payload so the inbox sidebar can patch the row in place instead of
      // refetching the whole RSC tree.
      authorId: user.id,
      lastAuthor: authorName,
      lastMessage: preview,
      lastAt: new Date().toISOString(),
    });

    return dto;
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

    if (message.conversationId) {
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
      channels.push(conversationChannel(message.conversationId));
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
      channels.push(conversationChannel(message.conversationId));
    void broadcast(channels, { type: "message.deleted", messageId: message.id });
  });
}

// ─── Inbox ─────────────────────────────────────────────────────────────────

export type InboxThread = {
  id: string; // project-<id> | conv-<id>
  kind: "project" | "direct";
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

  const projectWhere = isAdmin
    ? {}
    : { members: { some: { userId: user.id } } };

  const [projects, conversations, unreadCounts] = await Promise.all([
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
      where: { participants: { some: { memberId: user.id } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        participants: {
          include: { member: { select: { id: true, name: true, email: true, imageUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.notification.groupBy({
      by: ["linkUrl"],
      where: { recipientId: user.id, read: false, linkUrl: { not: null } },
      _count: true,
    }),
  ]);

  const unreadMap = new Map<string, number>();
  // Pre-aggregate per-project task-thread unreads in a single pass over the
  // notification groups, instead of scanning the whole map once per project.
  const projectTaskUnread = new Map<string, number>();
  for (const row of unreadCounts) {
    if (!row.linkUrl) continue;
    unreadMap.set(row.linkUrl, row._count);
    const m = row.linkUrl.match(/^\/dashboard\/projects\/([^/]+)\//);
    if (m) projectTaskUnread.set(m[1], (projectTaskUnread.get(m[1]) ?? 0) + row._count);
  }

  const projectThreads: InboxThread[] = projects.map((p) => {
    const last = p.messages[0];
    const unread =
      (unreadMap.get(`/dashboard/messages/project-${p.id}`) ?? 0) +
      (projectTaskUnread.get(p.id) ?? 0);
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
      lastMessage: last ? toDisplayBody(last.body) || "📎 Attachment" : "",
      lastAuthor: last ? (last.author.name ?? last.author.email) : "",
      lastAt: last ? last.createdAt.toISOString() : "",
      unread,
      avatar: generateColor(p.name),
      initials: p.name.charAt(0).toUpperCase(),
      inactive: !getActiveContract(p.contracts),
    };
  });

  const dmThreads: InboxThread[] = conversations
    .filter((c) => c.messages.length > 0 || c.isGroup)
    .map((c) => {
      const others = c.participants
        .map((pp) => pp.member)
        .filter((m) => m.id !== user.id);
      const name =
        c.title ??
        (others.map((m) => m.name ?? m.email).join(", ") || "Direct message");
      const last = c.messages[0];
      return {
        id: `conv-${c.id}`,
        kind: "direct" as const,
        name,
        subtitle: c.isGroup ? `${c.participants.length} members` : "Direct message",
        projectId: null,
        conversationId: c.id,
        logoUrl: null,
        // 1:1 DMs show the other person's photo; groups keep the initial.
        peerImageUrl: !c.isGroup && others.length === 1 ? (others[0].imageUrl ?? null) : null,
        peerMemberIds: others.map((m) => m.id),
        lastMessage: last ? toDisplayBody(last.body) || "📎 Attachment" : "",
        lastAuthor: last ? (last.author.name ?? last.author.email) : "",
        lastAt: last ? last.createdAt.toISOString() : "",
        unread: unreadMap.get(`/dashboard/messages/conv-${c.id}`) ?? 0,
        avatar: generateColor(name),
        initials: name.charAt(0).toUpperCase(),
        inactive: false,
      };
    });

  return [...projectThreads, ...dmThreads].sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return tb - ta;
  });
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
      select: { id: true },
    });
    if (!other) throw new Error("Member not found");

    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { memberId: user.id } } },
          { participants: { some: { memberId: otherMemberId } } },
        ],
      },
      include: { _count: { select: { participants: true } } },
    });
    if (existing && existing._count.participants === 2) return existing.id;

    const convo = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ memberId: user.id }, { memberId: otherMemberId }],
        },
      },
    });
    return convo.id;
  });
}

export async function getMessageableMembers() {
  const user = await requireUser();
  return prisma.user.findMany({
    where: { id: { not: user.id }, blocked: false },
    select: { id: true, name: true, email: true, imageUrl: true },
    orderBy: { name: "asc" },
    take: 500,
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
