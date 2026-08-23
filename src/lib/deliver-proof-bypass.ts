import { prisma } from "@/lib/prisma";
import { DIRECT_CONVERSATION_KIND } from "@/lib/client-chat";
import {
  encodeProofBypassBody,
  type ProofBypassPayload,
} from "@/lib/proof-bypass-payload";

export async function ensureBypassConversation(
  requesterId: string,
  approverId: string,
  title: string,
) {
  const convo = await prisma.conversation.create({
    data: {
      isGroup: false,
      title: title.slice(0, 80),
      kind: DIRECT_CONVERSATION_KIND,
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
  const rows = await prisma.message.findMany({
    where: { kind: "proof_bypass", body: { contains: passId } },
    select: { conversationId: true },
  });
  const conversationIds = [
    ...new Set(rows.map((row) => row.conversationId).filter((id): id is string => Boolean(id))),
  ];
  for (const conversationId of conversationIds) {
    const member = await prisma.conversationParticipant.findUnique({
      where: { conversationId_memberId: { conversationId, memberId: deciderId } },
    });
    if (!member) continue;
    await postBypassInbox(conversationId, payload);
  }
  await postBypassToProjectChat(payload, [payload.requesterId]);
}
