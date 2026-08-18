"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { sendMessage } from "@/actions/messages";
import { DIRECT_CONVERSATION_KIND } from "@/lib/client-chat";
import { getProjectMentionMembers } from "@/lib/project-mentions";
import { toMentionTokens } from "@/lib/note-mentions";
import {
  encodeTaskCommentBody,
  taskCommentUrl,
} from "@/lib/task-comment-payload";
import {
  asAnnotatableHtml,
  commentMarkTag,
  wrapFirstPlainText,
} from "@/lib/html-annotate";
import { revalidatePath } from "next/cache";

const commentInclude = {
  user: { select: { id: true, name: true, imageUrl: true } },
  mentions: { include: { user: { select: { id: true, name: true } } } },
} as const;

async function ensureThreadConversation(options: {
  threadId: string;
  taskTitle: string;
  participantIds: string[];
}): Promise<string> {
  const thread = await prisma.taskHighlightThread.findUnique({
    where: { id: options.threadId },
    select: { conversationId: true },
  });
  if (!thread) throw new Error("Thread not found");

  const unique = [...new Set(options.participantIds)].filter(Boolean);

  if (thread.conversationId) {
    await prisma.conversationParticipant.createMany({
      data: unique.map((memberId) => ({
        conversationId: thread.conversationId!,
        memberId,
      })),
      skipDuplicates: true,
    });
    return thread.conversationId;
  }

  const convo = await prisma.conversation.create({
    data: {
      isGroup: unique.length > 2,
      title: `Task · ${options.taskTitle}`.slice(0, 80),
      kind: DIRECT_CONVERSATION_KIND,
      participants: { create: unique.map((memberId) => ({ memberId })) },
    },
  });

  await prisma.taskHighlightThread.update({
    where: { id: options.threadId },
    data: { conversationId: convo.id },
  });

  return convo.id;
}

export async function createTaskHighlightComment(data: {
  taskId: string;
  quoteText: string;
  content: string;
  threadId?: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      createdById: true,
      assigneeId: true,
    },
  });
  if (!task) throw new Error("Task not found");

  const { user, member } = await requireProjectMember(task.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot comment on tasks");

  const trimmed = data.content.trim();
  if (!trimmed) throw new Error("Comment is empty");

  const members = await getProjectMentionMembers(task.projectId);
  const { body: tokenBody, mentionedIds } = toMentionTokens(trimmed, members);

  let thread = data.threadId
    ? await prisma.taskHighlightThread.findUnique({
        where: { id: data.threadId },
        include: { subscribers: { select: { userId: true } } },
      })
    : null;

  if (data.threadId && !thread) throw new Error("Thread not found");

  const isNew = !thread;
  let annotatedContent: string | null = null;
  if (!thread) {
    const quote = data.quoteText.trim();
    if (!quote) throw new Error("Select text to comment on");
    thread = await prisma.taskHighlightThread.create({
      data: {
        taskId: task.id,
        quoteText: quote,
        createdById: user.id,
        subscribers: {
          create: [...new Set([task.createdById, task.assigneeId, user.id].filter(Boolean) as string[])].map(
            (userId) => ({ userId }),
          ),
        },
      },
      include: { subscribers: { select: { userId: true } } },
    });

    const html = asAnnotatableHtml(task.description);
    const mark = commentMarkTag(thread.id);
    const next = wrapFirstPlainText(html, quote, mark.open, mark.close);
    if (next !== (task.description ?? "")) {
      await prisma.task.update({
        where: { id: task.id },
        data: { description: next },
      });
      annotatedContent = next;
    }
  }

  if (mentionedIds.length > 0) {
    await prisma.taskHighlightSubscriber.createMany({
      data: mentionedIds.map((userId) => ({
        threadId: thread!.id,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  const subscriberIds = [
    ...new Set([
      ...thread.subscribers.map((s) => s.userId),
      task.createdById,
      task.assigneeId,
      user.id,
      ...mentionedIds,
    ].filter(Boolean) as string[]),
  ];

  const conversationId = await ensureThreadConversation({
    threadId: thread.id,
    taskTitle: task.title,
    participantIds: subscriberIds,
  });

  const mentionTokens = members
    .filter((m) => mentionedIds.includes(m.id) && m.name)
    .map((m) => `@[${m.name}](${m.id})`);

  const messageBody = isNew
    ? encodeTaskCommentBody(
        {
          taskId: task.id,
          projectId: task.projectId,
          threadId: thread.id,
          taskTitle: task.title,
          quoteText: thread.quoteText,
          comment: trimmed,
        },
        mentionTokens,
      )
    : tokenBody;

  const sent = await sendMessage({
    conversationId,
    body: messageBody,
    kind: isNew ? "task_comment" : "message",
  });
  if (!sent.ok) throw new Error(sent.error);

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  revalidatePath(`/dashboard/projects/${task.projectId}/tasks/${task.id}`);
  revalidatePath(`/dashboard/messages/conv-${conversationId}`);

  return {
    threadId: thread.id,
    conversationId,
    taskUrl: taskCommentUrl(task.projectId, task.id, thread.id),
    description: annotatedContent,
  };
}

export async function getTaskHighlightThreads(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw new Error("Task not found");
  const { user } = await requireProjectMember(task.projectId);

  const threads = await prisma.taskHighlightThread.findMany({
    where: { taskId },
    include: {
      createdBy: { select: { id: true, name: true, imageUrl: true } },
      subscribers: { select: { userId: true, understoodAt: true } },
      comments: {
        include: commentInclude,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return threads.map((t) => ({
    ...t,
    understood: t.subscribers.some(
      (s) => s.userId === user.id && s.understoodAt,
    ),
  }));
}

export async function toggleTaskHighlightUnderstood(threadId: string) {
  const thread = await prisma.taskHighlightThread.findUnique({
    where: { id: threadId },
    include: { task: { select: { projectId: true } } },
  });
  if (!thread) throw new Error("Thread not found");

  const { user, member } = await requireProjectMember(thread.task.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot update comments");

  const existing = await prisma.taskHighlightSubscriber.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });

  if (existing?.understoodAt) {
    await prisma.taskHighlightSubscriber.update({
      where: { id: existing.id },
      data: { understoodAt: null },
    });
    revalidatePath(`/dashboard/projects/${thread.task.projectId}`);
    return { understood: false };
  }

  await prisma.taskHighlightSubscriber.upsert({
    where: { threadId_userId: { threadId, userId: user.id } },
    create: {
      threadId,
      userId: user.id,
      understoodAt: new Date(),
    },
    update: { understoodAt: new Date() },
  });

  revalidatePath(`/dashboard/projects/${thread.task.projectId}`);
  return { understood: true };
}
