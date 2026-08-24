import { prisma } from "@/lib/prisma";
import {
  encodeProofBypassBody,
  type ProofBypassPayload,
} from "@/lib/proof-bypass-payload";

export async function ensureBypassConversation(
  requesterId: string,
  approverId: string,
  _title: string,
) {
  const existing = await prisma.conversation.findFirst({
    where: {
      kind: "direct",
      isGroup: false,
      projectId: null,
      noteCommentThread: null,
      taskHighlightThread: null,
      AND: [
        { participants: { some: { memberId: requesterId } } },
        { participants: { some: { memberId: approverId } } },
      ],
    },
    select: { id: true, participants: { select: { memberId: true } } },
  });

  if (existing && existing.participants.length === 2) {
    return existing.id;
  }

  const convo = await prisma.conversation.create({
    data: {
      isGroup: false,
      kind: "direct",
      participants: {
        create: [{ memberId: requesterId }, { memberId: approverId }],
      },
    },
  });
  return convo.id;
}

export async function postBypassInbox(conversationId: string, payload: ProofBypassPayload) {
  const { sendMessage } = await import("@/actions/messages");
  const sent = await sendMessage({
    conversationId,
    body: encodeProofBypassBody(payload),
    kind: "proof_bypass",
  });
  if (!sent.ok) throw new Error(sent.error);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

export async function postBypassToProjectChat(
  payload: ProofBypassPayload,
  mentionUserIds: string[],
) {
  const { sendMessage } = await import("@/actions/messages");
  const users = mentionUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: mentionUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const tokens = users
    .filter((u) => u.name)
    .map((u) => `@[${u.name}](${u.id})`)
    .join(" ");
  const sent = await sendMessage({
    projectId: payload.projectId,
    body: tokens ? `${tokens}\n${encodeProofBypassBody(payload)}` : encodeProofBypassBody(payload),
    kind: "proof_bypass",
  });
  if (!sent.ok) throw new Error(sent.error);
}

export async function notifyRequesterInMailbox(
  passId: string,
  payload: ProofBypassPayload,
  deciderId: string,
) {
  const conversationId = await ensureBypassConversation(
    payload.requesterId,
    deciderId,
    "",
  );
  await postBypassInbox(conversationId, payload);
  await postBypassToProjectChat(payload, [payload.requesterId]);
}
