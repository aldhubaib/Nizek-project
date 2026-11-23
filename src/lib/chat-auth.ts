import "server-only";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/project-access";
import {
  canAccessClientConversation,
  CLIENT_CONVERSATION_KIND,
  isClientUser,
} from "@/lib/client-chat";
import {
  ANNOUNCEMENTS_CONVERSATION_ID,
  ANNOUNCEMENTS_CONVERSATION_KIND,
  canReadAnnouncements,
} from "@/lib/announcements";
import {
  conversationChannel,
  projectChannel,
  taskChannel,
} from "@/lib/channels";

export type ThreadTarget = {
  conversationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
};

export type ThreadAccessResult =
  | {
      allowed: true;
      canPost: boolean;
      isClientRoom: boolean;
      channel: string;
      projectId: string | null;
    }
  | {
      allowed: false;
      canPost: false;
      isClientRoom: false;
      channel: null;
      projectId: null;
    };

const DENIED: ThreadAccessResult = {
  allowed: false,
  canPost: false,
  isClientRoom: false,
  channel: null,
  projectId: null,
};

export type ThreadAccessDeps = {
  findConversation: (
    conversationId: string,
  ) => Promise<{ id: string; kind: string; projectId: string | null } | null>;
  isConversationParticipant: (
    conversationId: string,
    userId: string,
  ) => Promise<boolean>;
  checkClientConversation: (
    conversationId: string,
    user: { id: string; systemRole: string },
  ) => Promise<{ ok: boolean; canPost?: boolean }>;
  findTaskProjectId: (taskId: string) => Promise<string | null>;
  checkProjectAccess: (projectId: string) => Promise<boolean>;
};

const defaultDeps: ThreadAccessDeps = {
  findConversation: (conversationId) =>
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, kind: true, projectId: true },
    }),
  isConversationParticipant: async (conversationId, userId) => {
    const part = await prisma.conversationParticipant.findFirst({
      where: { conversationId, memberId: userId },
      select: { id: true },
    });
    return Boolean(part);
  },
  checkClientConversation: (conversationId, user) =>
    canAccessClientConversation(conversationId, user),
  findTaskProjectId: async (taskId) => {
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      select: { projectId: true },
    });
    return task?.projectId ?? null;
  },
  checkProjectAccess: (projectId) => hasProjectAccess(projectId),
};

/**
 * Single authorization boundary for reading, posting, reacting, subscribing,
 * and updating read/delivery cursors on any chat thread.
 */
export async function resolveThreadAccess(
  user: { id: string; systemRole: string },
  target: ThreadTarget,
  deps: ThreadAccessDeps = defaultDeps,
): Promise<ThreadAccessResult> {
  if (target.conversationId) {
    const conversationId = target.conversationId;
    if (conversationId === ANNOUNCEMENTS_CONVERSATION_ID) {
      if (!canReadAnnouncements(user)) return DENIED;
      return {
        allowed: true,
        canPost: true,
        isClientRoom: false,
        channel: conversationChannel(conversationId),
        projectId: null,
      };
    }

    const convo = await deps.findConversation(conversationId);
    if (!convo) return DENIED;

    if (convo.kind === ANNOUNCEMENTS_CONVERSATION_KIND) {
      if (!canReadAnnouncements(user)) return DENIED;
      return {
        allowed: true,
        canPost: true,
        isClientRoom: false,
        channel: conversationChannel(conversationId),
        projectId: null,
      };
    }

    if (convo.kind === CLIENT_CONVERSATION_KIND) {
      const access = await deps.checkClientConversation(conversationId, user);
      if (!access.ok) return DENIED;
      return {
        allowed: true,
        canPost: Boolean(access.canPost),
        isClientRoom: true,
        channel: conversationChannel(conversationId),
        projectId: convo.projectId,
      };
    }

    // Clients may only access client rooms, never DMs, groups, or note threads.
    if (isClientUser(user)) return DENIED;

    const isParticipant = await deps.isConversationParticipant(
      conversationId,
      user.id,
    );
    if (!isParticipant) return DENIED;
    return {
      allowed: true,
      canPost: true,
      isClientRoom: false,
      channel: conversationChannel(conversationId),
      projectId: convo.projectId,
    };
  }

  if (target.taskId) {
    if (isClientUser(user)) return DENIED;
    const projectId = await deps.findTaskProjectId(target.taskId);
    if (!projectId) return DENIED;
    if (!(await deps.checkProjectAccess(projectId))) return DENIED;
    return {
      allowed: true,
      canPost: true,
      isClientRoom: false,
      channel: taskChannel(target.taskId),
      projectId,
    };
  }

  if (target.projectId) {
    if (isClientUser(user)) return DENIED;
    if (!(await deps.checkProjectAccess(target.projectId))) return DENIED;
    return {
      allowed: true,
      canPost: true,
      isClientRoom: false,
      channel: projectChannel(target.projectId),
      projectId: target.projectId,
    };
  }

  return DENIED;
}
