import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import {
  taskChannel,
  projectChannel,
  conversationChannel,
} from "@/lib/channels";
import { getActiveContract } from "@/lib/contract-rules";
import {
  canAccessClientConversation,
  CLIENT_CONVERSATION_KIND,
  isClientUser,
} from "@/lib/client-chat";
import {
  ANNOUNCEMENTS_CONVERSATION_ID,
  ANNOUNCEMENTS_SUBTITLE,
  ANNOUNCEMENTS_THREAD_ID,
  ANNOUNCEMENTS_TITLE,
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

export type MobileThreadKind =
  | "project"
  | "task"
  | "direct"
  | "group"
  | "client"
  | "announcements"
  | "note-comment"
  | "task-comment";

/**
 * Everything the mobile chat screen needs to know about a thread besides the
 * messages themselves. Same rules as the web thread page
 * (`/dashboard/messages/[threadId]`), minus the parts that need a project UI
 * (create task, project panel).
 */
export type MobileThreadMeta = {
  threadId: string;
  kind: MobileThreadKind;
  target: { taskId?: string; projectId?: string; conversationId?: string };
  /** Centrifugo channel carrying this thread's live events. */
  channel: string;
  title: string;
  subtitle: string;
  /** Project logo or the other person's photo, when there is one. */
  avatarUrl: string | null;
  /** Everyone in the thread (incl. viewer) — for "Seen by" and mention chips. */
  memberNames: Record<string, string>;
  /** Everyone except the viewer. */
  peerMemberIds: string[];
  /** Who can be @mentioned from the composer. */
  mentionables: { id: string; name: string }[];
  /** memberId → ISO of that member's last read (never the viewer). */
  peerReads: Record<string, string>;
  /** Project has no active contract / client chat disabled → composer locked. */
  inactive: boolean;
  /** Can open but not post (client rooms the viewer is not assigned to). */
  readOnly: boolean;
  /** Announcements for non-admins: may reply to a post, not start one. */
  replyOnly: boolean;
  isClientRoom: boolean;
};

export async function resolveMobileThreadMeta(
  threadId: string,
): Promise<MobileThreadMeta> {
  const user = await requireUser();
  const client = isClientUser(user);
  const notFound = () => new Error("Not found");

  const memberNames: Record<string, string> = {};
  const peerReads: Record<string, string> = {};

  if (threadId.startsWith("task-")) {
    if (client) throw notFound();
    const taskId = threadId.slice(5);
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        taskNumber: true,
        projectId: true,
        project: {
          select: { name: true, logoUrl: true, contracts: { select: CONTRACT_SELECT } },
        },
      },
    });
    if (!task) throw notFound();
    if (!(await hasProjectAccess(task.projectId))) throw notFound();
    const mentionables = await projectMentionables(task.projectId, user.id, memberNames);
    return {
      threadId,
      kind: "task",
      target: { taskId: task.id, projectId: task.projectId },
      channel: taskChannel(task.id),
      title: `#${task.taskNumber} ${task.title}`,
      subtitle: task.project.name,
      avatarUrl: task.project.logoUrl ?? null,
      memberNames,
      peerMemberIds: Object.keys(memberNames).filter((id) => id !== user.id),
      mentionables,
      peerReads,
      inactive: !getActiveContract(task.project.contracts),
      readOnly: false,
      replyOnly: false,
      isClientRoom: false,
    };
  }

  if (threadId.startsWith("project-")) {
    if (client) throw notFound();
    const projectId = threadId.slice(8);
    if (!(await hasProjectAccess(projectId))) throw notFound();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        contracts: { select: CONTRACT_SELECT },
      },
    });
    if (!project) throw notFound();
    const mentionables = await projectMentionables(project.id, user.id, memberNames);
    const peerMemberIds = Object.keys(memberNames).filter((id) => id !== user.id);
    return {
      threadId,
      kind: "project",
      target: { projectId: project.id },
      channel: projectChannel(project.id),
      title: project.name,
      subtitle: `Project chat · ${peerMemberIds.length + 1} members`,
      avatarUrl: project.logoUrl ?? null,
      memberNames,
      peerMemberIds,
      mentionables,
      peerReads,
      inactive: !getActiveContract(project.contracts),
      readOnly: false,
      replyOnly: false,
      isClientRoom: false,
    };
  }

  if (threadId === ANNOUNCEMENTS_THREAD_ID) {
    if (!canReadAnnouncements(user)) throw notFound();
    await getOrCreateAnnouncementsConversation();
    const staff = await prisma.user.findMany({
      where: { systemRole: { not: "CLIENT" }, blocked: false },
      select: { id: true, name: true, email: true },
    });
    for (const m of staff) memberNames[m.id] = m.name ?? m.email;
    return {
      threadId,
      kind: "announcements",
      target: { conversationId: ANNOUNCEMENTS_CONVERSATION_ID },
      channel: conversationChannel(ANNOUNCEMENTS_CONVERSATION_ID),
      title: ANNOUNCEMENTS_TITLE,
      subtitle: ANNOUNCEMENTS_SUBTITLE,
      avatarUrl: null,
      memberNames,
      peerMemberIds: staff.map((m) => m.id).filter((id) => id !== user.id),
      mentionables: staff
        .filter((m) => m.id !== user.id)
        .map((m) => ({ id: m.id, name: m.name ?? m.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      peerReads,
      inactive: false,
      readOnly: false,
      replyOnly: !canPostAnnouncement(user),
      isClientRoom: false,
    };
  }

  if (!threadId.startsWith("conv-")) throw notFound();
  const conversationId = threadId.slice(5);
  const convoMeta = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, kind: true },
  });
  if (!convoMeta) throw notFound();

  if (convoMeta.kind === CLIENT_CONVERSATION_KIND) {
    const access = await canAccessClientConversation(conversationId, user);
    if (!access.ok || !access.conversation || !access.project) throw notFound();
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            member: { select: { id: true, name: true, email: true } },
          },
        },
        project: { select: { contracts: { select: CONTRACT_SELECT } } },
      },
    });
    if (!convo) throw notFound();
    for (const p of convo.participants) {
      memberNames[p.member.id] = p.member.name ?? p.member.email;
      if (p.memberId !== user.id && p.lastReadAt) {
        peerReads[p.memberId] = p.lastReadAt.toISOString();
      }
    }
    const others = convo.participants
      .map((p) => p.member)
      .filter((m) => m.id !== user.id);
    return {
      threadId,
      kind: "client",
      target: { conversationId: convo.id, projectId: access.project.id },
      channel: conversationChannel(convo.id),
      title: access.project.name,
      subtitle: client
        ? "Chatting with Nizek"
        : !access.project.clientChatEnabled
          ? "Client chat (disabled)"
          : access.canPost
            ? "Client chat"
            : "Client chat · View only",
      avatarUrl: access.project.logoUrl ?? null,
      memberNames,
      peerMemberIds: others.map((m) => m.id),
      mentionables: others
        .map((m) => ({ id: m.id, name: m.name ?? m.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      peerReads,
      inactive:
        !access.project.clientChatEnabled ||
        !getActiveContract(convo.project?.contracts ?? []),
      readOnly: !access.canPost,
      replyOnly: false,
      isClientRoom: true,
    };
  }

  if (client) throw notFound();
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { memberId: user.id } } },
    include: {
      participants: {
        include: {
          member: { select: { id: true, name: true, email: true, imageUrl: true } },
        },
      },
      noteCommentThread: {
        select: {
          note: {
            select: { projectId: true, title: true, project: { select: { name: true } } },
          },
        },
      },
      taskHighlightThread: {
        select: {
          task: {
            select: { projectId: true, title: true, project: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!convo) throw notFound();

  for (const p of convo.participants) {
    memberNames[p.member.id] = p.member.name ?? p.member.email;
    if (p.memberId !== user.id && p.lastReadAt) {
      peerReads[p.memberId] = p.lastReadAt.toISOString();
    }
  }
  const others = convo.participants
    .map((p) => p.member)
    .filter((m) => m.id !== user.id);
  const peerMemberIds = others.map((m) => m.id);

  const base = {
    threadId,
    target: { conversationId: convo.id },
    channel: conversationChannel(convo.id),
    memberNames,
    peerMemberIds,
    peerReads,
    inactive: false,
    readOnly: false,
    replyOnly: false,
    isClientRoom: false,
  };

  if (convo.noteCommentThread) {
    const note = convo.noteCommentThread.note;
    return {
      ...base,
      kind: "note-comment",
      title: note.title,
      subtitle: `${note.project.name} · Note comment`,
      avatarUrl: null,
      mentionables: await projectMentionables(note.projectId, user.id, memberNames),
    };
  }
  if (convo.taskHighlightThread) {
    const task = convo.taskHighlightThread.task;
    return {
      ...base,
      kind: "task-comment",
      title: task.title,
      subtitle: `${task.project.name} · Task comment`,
      avatarUrl: null,
      mentionables: await projectMentionables(task.projectId, user.id, memberNames),
    };
  }

  const isGroup = convo.isGroup || others.length > 1;
  return {
    ...base,
    kind: isGroup ? "group" : "direct",
    title:
      convo.title ??
      (others.map((m) => m.name ?? m.email).join(", ") || "Direct message"),
    subtitle: isGroup ? `${convo.participants.length} members` : "Direct message",
    avatarUrl: isGroup ? null : (others[0]?.imageUrl ?? null),
    mentionables: others
      .map((m) => ({ id: m.id, name: m.name ?? m.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Project members minus the viewer; also fills `memberNames` for everyone. */
async function projectMentionables(
  projectId: string,
  viewerId: string,
  memberNames: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const out: { id: string; name: string }[] = [];
  for (const { user } of members) {
    const name = user.name ?? user.email;
    memberNames[user.id] = name;
    if (user.id !== viewerId) out.push({ id: user.id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
