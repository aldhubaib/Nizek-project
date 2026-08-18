"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireUser } from "@/lib/auth";
import {
  CLIENT_CONVERSATION_KIND,
  ensureClientChatParticipant,
  getClientConversation,
  isClientUser,
  syncClientConversationParticipants,
} from "@/lib/client-chat";

export type ClientChatPerson = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  systemRole: string;
  /** Auto-managed client vs curated staff */
  kind: "client" | "staff";
};

async function requireClientChatRosterAccess(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);
  if (user.systemRole === "ADMIN") {
    return { user, member };
  }
  if (member.projectRole?.isAdmin || member.role === "ADMIN" || member.role === "PROJECT_MANAGER") {
    return { user, member };
  }
  const full = await prisma.projectMember.findUnique({
    where: { id: member.id },
    select: { canInviteClients: true },
  });
  if (!full?.canInviteClients) {
    throw new Error("You don't have permission to manage client chat people");
  }
  return { user, member };
}

export async function getClientChatRoster(projectId: string): Promise<{
  enabled: boolean;
  conversationId: string | null;
  people: ClientChatPerson[];
  addableStaff: ClientChatPerson[];
  canManage: boolean;
}> {
  const user = await requireUser();
  let canManage = false;
  try {
    await requireClientChatRosterAccess(projectId);
    canManage = true;
  } catch {
    // Viewer may still be a participant — return read-only roster if they can access.
    canManage = false;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientChatEnabled: true },
  });
  if (!project) throw new Error("Project not found");

  // Keep clients in sync whenever roster is loaded.
  if (project.clientChatEnabled) {
    await syncClientConversationParticipants(projectId).catch(() => {});
  }

  const convo = await getClientConversation(projectId);
  if (!convo) {
    return {
      enabled: project.clientChatEnabled,
      conversationId: null,
      people: [],
      addableStaff: [],
      canManage,
    };
  }

  // Non-managers must be participants (or system admin) to see the roster.
  if (!canManage && user.systemRole !== "ADMIN") {
    const part = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_memberId: {
          conversationId: convo.id,
          memberId: user.id,
        },
      },
      select: { id: true },
    });
    if (!part) {
      throw new Error("Permission denied");
    }
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: convo.id },
    include: {
      member: {
        select: {
          id: true,
          name: true,
          email: true,
          imageUrl: true,
          systemRole: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const people: ClientChatPerson[] = participants.map((p) => ({
    id: p.member.id,
    name: p.member.name,
    email: p.member.email,
    imageUrl: p.member.imageUrl,
    systemRole: p.member.systemRole,
    kind: isClientUser(p.member) ? "client" : "staff",
  }));

  const inRoom = new Set(people.map((p) => p.id));

  const staffOnProject = await prisma.projectMember.findMany({
    where: {
      projectId,
      user: { systemRole: { not: "CLIENT" }, blocked: false },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          imageUrl: true,
          systemRole: true,
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const addableStaff: ClientChatPerson[] = staffOnProject
    .filter((m) => !inRoom.has(m.user.id))
    .map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      imageUrl: m.user.imageUrl,
      systemRole: m.user.systemRole,
      kind: "staff" as const,
    }));

  return {
    enabled: project.clientChatEnabled,
    conversationId: convo.id,
    people,
    addableStaff: canManage ? addableStaff : [],
    canManage,
  };
}

export async function addClientChatStaff(data: {
  projectId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireClientChatRosterAccess(data.projectId);

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { clientChatEnabled: true },
    });
    if (!project?.clientChatEnabled) {
      return { ok: false, error: "Client chat is not enabled" };
    }

    const convo = await getClientConversation(data.projectId);
    if (!convo) return { ok: false, error: "Client chat not found" };

    const target = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, systemRole: true, blocked: true },
    });
    if (!target || target.blocked) return { ok: false, error: "User not found" };
    if (isClientUser(target)) {
      return { ok: false, error: "Clients are added automatically" };
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: target.id, projectId: data.projectId },
      },
      select: { id: true },
    });
    // System admins may be added without membership.
    if (!membership && target.systemRole !== "ADMIN") {
      return { ok: false, error: "User must be on the project first" };
    }

    await ensureClientChatParticipant(convo.id, target.id);

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    revalidatePath("/dashboard/messages");
    revalidatePath(`/dashboard/messages/conv-${convo.id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to add",
    };
  }
}

export async function removeClientChatStaff(data: {
  projectId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireClientChatRosterAccess(data.projectId);

    const convo = await getClientConversation(data.projectId);
    if (!convo) return { ok: false, error: "Client chat not found" };

    const target = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, systemRole: true },
    });
    if (!target) return { ok: false, error: "User not found" };
    if (isClientUser(target)) {
      return {
        ok: false,
        error: "Clients stay in chat while they're on the project",
      };
    }

    await prisma.conversationParticipant.deleteMany({
      where: {
        conversationId: convo.id,
        memberId: target.id,
        conversation: { kind: CLIENT_CONVERSATION_KIND },
      },
    });

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    revalidatePath("/dashboard/messages");
    revalidatePath(`/dashboard/messages/conv-${convo.id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to remove",
    };
  }
}
