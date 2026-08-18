import { prisma } from "@/lib/prisma";

export const CLIENT_CONVERSATION_KIND = "client" as const;
export const DIRECT_CONVERSATION_KIND = "direct" as const;

export function isClientUser(user: { systemRole: string } | null | undefined): boolean {
  return user?.systemRole === "CLIENT";
}

/** Resolve the client room for a project (may exist even when chat is disabled). */
export async function getClientConversation(projectId: string) {
  return prisma.conversation.findFirst({
    where: { projectId, kind: CLIENT_CONVERSATION_KIND },
    select: {
      id: true,
      projectId: true,
      kind: true,
      title: true,
      isGroup: true,
    },
  });
}

/**
 * Auto-manage only CLIENT project members in the client room.
 * Staff are curated manually — never auto-added here.
 * Also drops anyone (staff or client) who is no longer a project member.
 */
export async function syncClientConversationParticipants(projectId: string) {
  const convo = await prisma.conversation.findFirst({
    where: { projectId, kind: CLIENT_CONVERSATION_KIND },
    select: { id: true },
  });
  if (!convo) return null;

  const [projectMembers, existing] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      select: {
        userId: true,
        user: { select: { systemRole: true } },
      },
    }),
    prisma.conversationParticipant.findMany({
      where: { conversationId: convo.id },
      select: {
        id: true,
        memberId: true,
        member: { select: { systemRole: true } },
      },
    }),
  ]);

  const memberIds = new Set(projectMembers.map((m) => m.userId));
  const clientIds = new Set(
    projectMembers
      .filter((m) => m.user.systemRole === "CLIENT")
      .map((m) => m.userId),
  );
  const existingIds = new Set(existing.map((p) => p.memberId));

  // Add any project clients missing from the room.
  const toAdd = [...clientIds].filter((id) => !existingIds.has(id));

  // Remove: clients no longer on the project (or no longer clients),
  // and anyone (incl. staff) who left the project entirely.
  // Keep curated staff who are still project members.
  const toRemove = existing.filter((p) => {
    if (!memberIds.has(p.memberId)) return true;
    if (p.member.systemRole === "CLIENT" && !clientIds.has(p.memberId)) return true;
    return false;
  });

  await prisma.$transaction([
    ...(toAdd.length > 0
      ? [
          prisma.conversationParticipant.createMany({
            data: toAdd.map((memberId) => ({
              conversationId: convo.id,
              memberId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(toRemove.length > 0
      ? [
          prisma.conversationParticipant.deleteMany({
            where: { id: { in: toRemove.map((p) => p.id) } },
          }),
        ]
      : []),
  ]);

  return convo.id;
}

/** Ensure a staff user is in the client room (idempotent). */
export async function ensureClientChatParticipant(
  conversationId: string,
  memberId: string,
) {
  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_memberId: { conversationId, memberId },
    },
    create: { conversationId, memberId },
    update: {},
  });
}

/**
 * Create (or reuse) the client conversation, sync clients, optionally seed the
 * staff member who enabled it, flip the flag on.
 */
export async function enableClientChat(
  projectId: string,
  enablerUserId?: string,
): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Project not found");

  let convo = await prisma.conversation.findFirst({
    where: { projectId, kind: CLIENT_CONVERSATION_KIND },
    select: { id: true },
  });

  if (!convo) {
    convo = await prisma.conversation.create({
      data: {
        kind: CLIENT_CONVERSATION_KIND,
        projectId,
        isGroup: true,
        title: project.name,
      },
      select: { id: true },
    });
  } else {
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { title: project.name, isGroup: true },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { clientChatEnabled: true },
  });

  await syncClientConversationParticipants(projectId);

  // Seed the enabler if they're staff on the project (not a client).
  if (enablerUserId) {
    const enabler = await prisma.user.findUnique({
      where: { id: enablerUserId },
      select: { id: true, systemRole: true },
    });
    if (enabler && !isClientUser(enabler)) {
      const onProject =
        enabler.systemRole === "ADMIN" ||
        !!(await prisma.projectMember.findUnique({
          where: {
            userId_projectId: { userId: enabler.id, projectId },
          },
          select: { id: true },
        }));
      if (onProject) {
        await ensureClientChatParticipant(convo.id, enabler.id);
      }
    }
  }

  return convo.id;
}

/**
 * Disable client chat for the project. History and conversation row are kept.
 * Clients lose access via the enabled flag + inbox filters.
 */
export async function disableClientChat(projectId: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { clientChatEnabled: false },
  });
}

/**
 * Staff (or enabled client participant) may access a client conversation.
 * When disabled, only non-client users who are participants (or system admins
 * with project access) may still read history.
 */
export async function canAccessClientConversation(
  conversationId: string,
  user: { id: string; systemRole: string },
): Promise<{
  ok: boolean;
  conversation: {
    id: string;
    projectId: string | null;
    kind: string;
  } | null;
  project: { id: string; name: string; clientChatEnabled: boolean; logoUrl: string | null } | null;
  canPost: boolean;
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      projectId: true,
      kind: true,
      participants: { where: { memberId: user.id }, select: { memberId: true } },
    },
  });

  if (!conversation || conversation.kind !== CLIENT_CONVERSATION_KIND) {
    return { ok: false, conversation: null, project: null, canPost: false };
  }
  if (!conversation.projectId) {
    return { ok: false, conversation: null, project: null, canPost: false };
  }

  const project = await prisma.project.findUnique({
    where: { id: conversation.projectId },
    select: { id: true, name: true, clientChatEnabled: true, logoUrl: true },
  });
  if (!project) {
    return { ok: false, conversation: null, project: null, canPost: false };
  }

  const isParticipant = conversation.participants.length > 0;
  const isAdmin = user.systemRole === "ADMIN";
  const client = isClientUser(user);

  if (client) {
    if (!project.clientChatEnabled || !isParticipant) {
      return { ok: false, conversation: null, project: null, canPost: false };
    }
    return {
      ok: true,
      conversation: {
        id: conversation.id,
        projectId: conversation.projectId,
        kind: conversation.kind,
      },
      project,
      canPost: true,
    };
  }

  // Staff: must be a curated participant, or system admin (read/manage).
  if (!isParticipant && !isAdmin) {
    return { ok: false, conversation: null, project: null, canPost: false };
  }

  if (!isParticipant && isAdmin) {
    return {
      ok: true,
      conversation: {
        id: conversation.id,
        projectId: conversation.projectId,
        kind: conversation.kind,
      },
      project,
      canPost: project.clientChatEnabled,
    };
  }

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      projectId: conversation.projectId,
      kind: conversation.kind,
    },
    project,
    canPost: project.clientChatEnabled,
  };
}

export async function assertCanAccessClientConversation(
  conversationId: string,
  user: { id: string; systemRole: string },
) {
  const result = await canAccessClientConversation(conversationId, user);
  if (!result.ok || !result.conversation) {
    throw new Error("Conversation not found");
  }
  return result;
}

/**
 * Extension hook for later system cards (approvals, etc.).
 * Resolves the client room and creates a message when chat is enabled.
 */
export async function postClientSystemMessage(input: {
  projectId: string;
  authorId: string;
  body: string;
  kind?: string;
  taskId?: string | null;
}): Promise<{ id: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { clientChatEnabled: true },
  });
  if (!project?.clientChatEnabled) return null;

  const convo = await getClientConversation(input.projectId);
  if (!convo) return null;

  const message = await prisma.message.create({
    data: {
      conversationId: convo.id,
      projectId: input.projectId,
      authorId: input.authorId,
      body: input.body,
      kind: input.kind ?? "message",
      ...(input.taskId ? { taskId: input.taskId } : {}),
    },
    select: { id: true },
  });

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { updatedAt: new Date() },
  });

  return message;
}
