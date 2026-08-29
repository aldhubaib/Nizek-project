"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { sendMessage } from "@/actions/messages";
import { DIRECT_CONVERSATION_KIND } from "@/lib/client-chat";
import { getProjectMentionMembers } from "@/lib/project-mentions";
import { toMentionTokens } from "@/lib/note-mentions";
import {
  encodeNoteCommentBody,
  noteCommentUrl,
} from "@/lib/note-comment-payload";
import {
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
  noteTitle: string;
  participantIds: string[];
}): Promise<string> {
  const thread = await prisma.noteCommentThread.findUnique({
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
      title: `Note · ${options.noteTitle}`.slice(0, 80),
      kind: DIRECT_CONVERSATION_KIND,
      participants: { create: unique.map((memberId) => ({ memberId })) },
    },
  });

  await prisma.noteCommentThread.update({
    where: { id: options.threadId },
    data: { conversationId: convo.id },
  });

  return convo.id;
}

export async function createNoteComment(data: {
  noteId: string;
  quoteText: string;
  content: string;
  threadId?: string;
  annotatedContent?: string;
}) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: data.noteId },
    select: {
      id: true,
      title: true,
      content: true,
      projectId: true,
      authorId: true,
      noteType: true,
      project: { select: { name: true } },
    },
  });
  if (!note) throw new Error("Note not found");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot comment on notes");

  const trimmed = data.content.trim();
  if (!trimmed) throw new Error("Comment is empty");

  const members = await getProjectMentionMembers(note.projectId);
  const { body: tokenBody, mentionedIds } = toMentionTokens(trimmed, members);

  let thread = data.threadId
    ? await prisma.noteCommentThread.findUnique({
        where: { id: data.threadId },
        include: { subscribers: { select: { userId: true } } },
      })
    : null;

  if (data.threadId && !thread) throw new Error("Thread not found");

  const isNew = !thread;
  if (!thread) {
    const quote = data.quoteText.trim();
    if (!quote) throw new Error("Select text to comment on");
    thread = await prisma.noteCommentThread.create({
      data: {
        noteId: note.id,
        quoteText: quote,
        createdById: user.id,
        subscribers: {
          create: [...new Set([note.authorId, user.id])].map((userId) => ({
            userId,
          })),
        },
      },
      include: { subscribers: { select: { userId: true } } },
    });

    const nextContent =
      data.annotatedContent ??
      (() => {
        const mark = commentMarkTag(thread!.id);
        return wrapFirstPlainText(note.content, quote, mark.open, mark.close);
      })();
    if (nextContent !== note.content) {
      await prisma.meetingNote.update({
        where: { id: note.id },
        data: { content: nextContent },
      });
    }
  }

  if (mentionedIds.length > 0) {
    await prisma.noteCommentSubscriber.createMany({
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
      note.authorId,
      user.id,
      ...mentionedIds,
    ]),
  ];

  const conversationId = await ensureThreadConversation({
    threadId: thread.id,
    noteTitle: note.title,
    participantIds: subscriberIds,
  });

  const mentionTokens = members
    .filter((m) => mentionedIds.includes(m.id) && m.name)
    .map((m) => `@[${m.name}](${m.id})`);

  const messageBody = isNew
    ? encodeNoteCommentBody(
        {
          noteId: note.id,
          projectId: note.projectId,
          projectName: note.project.name,
          threadId: thread.id,
          noteTitle: note.title,
          quoteText: thread.quoteText,
          comment: trimmed,
        },
        mentionTokens,
      )
    : tokenBody;

  const sent = await sendMessage({
    conversationId,
    body: messageBody,
    kind: isNew ? "note_comment" : "message",
  });
  if (!sent.ok) throw new Error(sent.error);

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  revalidatePath(`/dashboard/messages/conv-${conversationId}`);

  return {
    threadId: thread.id,
    conversationId,
    noteUrl: noteCommentUrl(note.projectId, note.id, thread.id, note.noteType),
  };
}

export async function getNoteCommentThread(threadId: string) {
  const thread = await prisma.noteCommentThread.findUnique({
    where: { id: threadId },
    include: {
      note: { select: { id: true, projectId: true, title: true } },
      subscribers: { select: { userId: true, understoodAt: true } },
      comments: {
        include: commentInclude,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread) throw new Error("Thread not found");

  const { user } = await requireProjectMember(thread.note.projectId);

  return {
    id: thread.id,
    noteId: thread.note.id,
    noteTitle: thread.note.title,
    quoteText: thread.quoteText,
    conversationId: thread.conversationId,
    comments: thread.comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      user: c.user,
    })),
    understood: thread.subscribers.some((s) => s.userId === user.id && s.understoodAt),
  };
}

export async function getNoteCommentThreads(noteId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    select: { projectId: true },
  });
  if (!note) throw new Error("Note not found");
  await requireProjectMember(note.projectId);

  return prisma.noteCommentThread.findMany({
    where: { noteId },
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
}

export async function toggleNoteCommentUnderstood(threadId: string) {
  const thread = await prisma.noteCommentThread.findUnique({
    where: { id: threadId },
    include: { note: { select: { projectId: true, authorId: true } } },
  });
  if (!thread) throw new Error("Thread not found");

  const { user, member } = await requireProjectMember(thread.note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot update comments");

  const existing = await prisma.noteCommentSubscriber.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });

  if (existing?.understoodAt) {
    await prisma.noteCommentSubscriber.update({
      where: { id: existing.id },
      data: { understoodAt: null },
    });
    revalidatePath(`/dashboard/projects/${thread.note.projectId}`);
    return { understood: false };
  }

  await prisma.noteCommentSubscriber.upsert({
    where: { threadId_userId: { threadId, userId: user.id } },
    create: {
      threadId,
      userId: user.id,
      understoodAt: new Date(),
    },
    update: { understoodAt: new Date() },
  });

  revalidatePath(`/dashboard/projects/${thread.note.projectId}`);
  return { understood: true };
}
