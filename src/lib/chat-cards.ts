import "server-only";
import { prisma } from "@/lib/prisma";
import {
  conversationChannel,
  conversationClientChannel,
  projectChannel,
  publish,
} from "@/lib/centrifugo";
import {
  getAliasMap,
  maskImage,
  maskName,
  maskNoteActivity,
  maskPlainNames,
  type AliasIdentity,
} from "@/lib/alias";
import { getClientConversation } from "@/lib/client-chat";
import { fanOutMessageSideEffects } from "@/lib/message-fanout";
import {
  encodeNoteActivityBody,
  noteActivityPreview,
  type NoteActivityPayload,
} from "@/lib/note-activity-payload";
import {
  clientIssuePreview,
  encodeClientIssueBody,
  type ClientIssuePayload,
} from "@/lib/client-issue-payload";
import type { MessageDTO } from "@/actions/messages";

/**
 * System cards written straight into a thread.
 *
 * sendMessage is the path for anything a person typed, and it checks that the
 * author may post where they are posting. These cards are raised by the app on
 * someone's behalf and routinely land in threads the actor is not a member of —
 * a sprint announcement in a client room the lead was never added to, a client's
 * issue in the internal project channel they cannot read. Each function here
 * decides its own audience and then owes the reader everything sendMessage
 * would have done: both realtime audiences, notifications, unread cursors and
 * the inbox preview.
 */

type CardMessage = {
  id: string;
  kind: string;
  createdAt: Date;
  author: { name: string | null; email: string; imageUrl: string | null };
};

async function insertCard(input: {
  conversationId: string | null;
  projectId: string;
  authorId: string;
  body: string;
  kind: string;
}): Promise<CardMessage> {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      projectId: input.projectId,
      authorId: input.authorId,
      body: input.body,
      kind: input.kind,
    },
    include: {
      author: { select: { name: true, email: true, imageUrl: true } },
    },
  });
}

function cardDTO(input: {
  message: CardMessage;
  authorId: string;
  authorName: string;
  projectId: string;
  conversationId: string | null;
  preview: string;
  payload: Partial<Pick<MessageDTO, "noteActivity" | "clientIssue">>;
}): MessageDTO {
  return {
    id: input.message.id,
    taskId: null,
    projectId: input.projectId,
    conversationId: input.conversationId,
    kind: input.message.kind,
    authorId: input.authorId,
    authorName: input.authorName,
    authorImageUrl: input.message.author.imageUrl ?? null,
    body: input.preview,
    createdAt: input.message.createdAt.toISOString(),
    attachments: [],
    replyToId: null,
    task: null,
    mentions: [],
    ...input.payload,
  };
}

function maskClientIssue(
  payload: ClientIssuePayload,
  map: Map<string, AliasIdentity>,
): ClientIssuePayload {
  if (map.size === 0) return payload;
  return {
    ...payload,
    title: maskPlainNames(payload.title, map),
    ...(payload.excerpt ? { excerpt: maskPlainNames(payload.excerpt, map) } : {}),
  };
}

/**
 * Mirror a note-activity card into a project's client room.
 *
 * Two publishes, as everywhere else in this room: staff read the plain
 * channel, clients read the `-client` twin carrying the aliased payload.
 */
export async function postNoteActivityToClientRoom(input: {
  authorId: string;
  payload: NoteActivityPayload;
}): Promise<void> {
  const { authorId, payload } = input;
  const projectId = payload.projectId;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, logoUrl: true, clientChatEnabled: true },
  });
  if (!project?.clientChatEnabled) return;

  const convo = await getClientConversation(projectId);
  if (!convo) return;

  const participantIds = await roomParticipantIds(convo.id);
  if (participantIds.length === 0) return;

  const message = await insertCard({
    conversationId: convo.id,
    projectId,
    authorId,
    body: encodeNoteActivityBody(payload),
    kind: "note_activity",
  });

  const authorName = message.author.name ?? message.author.email ?? "Someone";
  const preview = noteActivityPreview(payload);
  const dto = cardDTO({
    message,
    authorId,
    authorName,
    projectId,
    conversationId: convo.id,
    preview,
    payload: { noteActivity: payload },
  });

  void publish(conversationChannel(convo.id), { type: "message.new", message: dto });

  const aliasMap = await getAliasMap(projectId);
  void publish(conversationClientChannel(convo.id), {
    type: "message.new",
    message: {
      ...dto,
      authorName: maskName(authorId, authorName, aliasMap),
      authorImageUrl: maskImage(authorId, dto.authorImageUrl, aliasMap),
      body: maskPlainNames(dto.body, aliasMap),
      noteActivity: maskNoteActivity(payload, aliasMap),
    } satisfies MessageDTO,
  });

  await fanOutMessageSideEffects({
    conversationId: convo.id,
    projectId,
    taskId: null,
    userId: authorId,
    isClientRoom: true,
    participantIds,
    uniqueRecipients: participantIds.filter((id) => id !== authorId),
    notifyType: "message",
    title: `${authorName} · ${project.name} · Client`,
    notifBody: preview,
    url: `/dashboard/messages/conv-${convo.id}`,
    threadId: `conv-${convo.id}`,
    authorName,
    preview,
    notifIcon: project.logoUrl ?? message.author.imageUrl ?? undefined,
    messageCreatedAt: message.createdAt,
  });
}

/**
 * Announce a client-raised issue in both rooms.
 *
 * The team needs it in the internal project channel, where the work actually
 * gets picked up, and the client needs their own copy as the receipt that the
 * report landed. Two rows rather than one shared thread, because those are two
 * separate threads by design.
 */
export async function postClientIssueCards(input: {
  authorId: string;
  payload: ClientIssuePayload;
}): Promise<void> {
  const { authorId, payload } = input;
  const projectId = payload.projectId;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, logoUrl: true, clientChatEnabled: true },
  });
  if (!project) return;

  const body = encodeClientIssueBody(payload);
  const preview = clientIssuePreview(payload);

  const ctx = { authorId, projectId, project, body, preview, payload };
  // Independent on purpose: a client room that is switched off or a Centrifugo
  // hiccup on one side must not cost the other side its copy.
  const results = await Promise.allSettled([
    postIssueToProjectChat(ctx),
    postIssueToClientRoom(ctx),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[client issue card]", r.reason);
  }
}

type IssueCardContext = {
  authorId: string;
  projectId: string;
  project: { name: string; logoUrl: string | null; clientChatEnabled: boolean };
  body: string;
  preview: string;
  payload: ClientIssuePayload;
};

async function postIssueToProjectChat(ctx: IssueCardContext): Promise<void> {
  const { authorId, projectId, project, body, preview, payload } = ctx;

  const message = await insertCard({
    conversationId: null,
    projectId,
    authorId,
    body,
    kind: "client_issue",
  });
  const authorName = message.author.name ?? message.author.email ?? "A client";
  const dto = cardDTO({
    message,
    authorId,
    authorName,
    projectId,
    conversationId: null,
    preview,
    payload: { clientIssue: payload },
  });

  void publish(projectChannel(projectId), { type: "message.new", message: dto });

  // Everyone on the team, and only the team: the project thread 404s for a
  // client, so notifying the reporter's fellow clients would be a dead link.
  const staffIds = (
    await prisma.projectMember.findMany({
      where: { projectId, user: { systemRole: { not: "CLIENT" } } },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  await fanOutMessageSideEffects({
    conversationId: null,
    projectId,
    taskId: null,
    userId: authorId,
    isClientRoom: false,
    participantIds: staffIds,
    uniqueRecipients: staffIds.filter((id) => id !== authorId),
    // Not "mention": nobody was named. It rides the same preference and mute
    // switches as anything else posted in the project channel.
    notifyType: "message",
    title: `${authorName} · ${project.name}`,
    notifBody: preview,
    url: `/dashboard/messages/project-${projectId}`,
    threadId: `project-${projectId}`,
    authorName,
    preview,
    notifIcon: project.logoUrl ?? message.author.imageUrl ?? undefined,
    messageCreatedAt: message.createdAt,
  });
}

async function postIssueToClientRoom(ctx: IssueCardContext): Promise<void> {
  const { authorId, projectId, project, body, preview, payload } = ctx;
  if (!project.clientChatEnabled) return;

  const convo = await getClientConversation(projectId);
  if (!convo) return;
  const participantIds = await roomParticipantIds(convo.id);
  if (participantIds.length === 0) return;

  const message = await insertCard({
    conversationId: convo.id,
    projectId,
    authorId,
    body,
    kind: "client_issue",
  });
  const authorName = message.author.name ?? message.author.email ?? "A client";
  const dto = cardDTO({
    message,
    authorId,
    authorName,
    projectId,
    conversationId: convo.id,
    preview,
    payload: { clientIssue: payload },
  });

  void publish(conversationChannel(convo.id), { type: "message.new", message: dto });

  const aliasMap = await getAliasMap(projectId);
  void publish(conversationClientChannel(convo.id), {
    type: "message.new",
    message: {
      ...dto,
      authorName: maskName(authorId, authorName, aliasMap),
      authorImageUrl: maskImage(authorId, dto.authorImageUrl, aliasMap),
      body: maskPlainNames(dto.body, aliasMap),
      clientIssue: maskClientIssue(payload, aliasMap),
    } satisfies MessageDTO,
  });

  await fanOutMessageSideEffects({
    conversationId: convo.id,
    projectId,
    taskId: null,
    userId: authorId,
    isClientRoom: true,
    participantIds,
    uniqueRecipients: participantIds.filter((id) => id !== authorId),
    notifyType: "message",
    title: `${authorName} · ${project.name} · Client`,
    notifBody: preview,
    url: `/dashboard/messages/conv-${convo.id}`,
    threadId: `conv-${convo.id}`,
    authorName,
    preview,
    notifIcon: project.logoUrl ?? message.author.imageUrl ?? undefined,
    messageCreatedAt: message.createdAt,
  });
}

async function roomParticipantIds(conversationId: string): Promise<string[]> {
  return (
    await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { memberId: true },
    })
  ).map((p) => p.memberId);
}
