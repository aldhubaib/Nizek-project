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
import { getThreadNotificationLevel } from "@/actions/notification-preferences";
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
  /** Everyone's avatar URL (or null) — for Message Info rows. */
  memberAvatars: Record<string, string | null>;
  /** Optional role label per member for Chat Info (project role / staff / client). */
  memberRoles?: Record<string, string>;
  /** Everyone except the viewer. */
  peerMemberIds: string[];
  /** Who can be @mentioned from the composer. */
  mentionables: { id: string; name: string }[];
  /** memberId → ISO of that member's last read (never the viewer). */
  peerReads: Record<string, string>;
  /** memberId → ISO of that member's last delivery (never the viewer). */
  peerDeliveries: Record<string, string>;
  /** Project has no active contract / client chat disabled → composer locked. */
  inactive: boolean;
  /** Can open but not post (client rooms the viewer is not assigned to). */
  readOnly: boolean;
  /** Resolved notification level for the viewer. */
  notifications: "all" | "mentions" | "none";
  /** Announcements for non-admins: may reply to a post, not start one. */
  replyOnly: boolean;
  isClientRoom: boolean;
};

export async function resolveMobileThreadMeta(threadId: string): Promise<MobileThreadMeta> {
  const meta = await loadMobileThreadMeta(threadId);
  const setting = await getThreadNotificationLevel(threadId);
  return { ...meta, notifications: setting.level };
}

async function loadMobileThreadMeta(
  threadId: string,
): Promise<Omit<MobileThreadMeta, "notifications">> {
  const user = await requireUser();
  const client = isClientUser(user);
  const notFound = () => new Error("Not found");

  const memberNames: Record<string, string> = {};
  const memberAvatars: Record<string, string | null> = {};
  const memberRoles: Record<string, string> = {};
  const peerReads: Record<string, string> = {};
  const peerDeliveries: Record<string, string> = {};

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
    const mentionables = await projectMentionables(
      task.projectId,
      user.id,
      memberNames,
      memberAvatars,
      memberRoles,
    );
    return {
      threadId,
      kind: "task",
      target: { taskId: task.id, projectId: task.projectId },
      channel: taskChannel(task.id),
      title: `#${task.taskNumber} ${task.title}`,
      subtitle: task.project.name,
      avatarUrl: task.project.logoUrl ?? null,
      memberNames,
      memberAvatars,
      memberRoles,
      peerMemberIds: Object.keys(memberNames).filter((id) => id !== user.id),
      mentionables,
      peerReads,
      peerDeliveries,
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
    const [mentionables] = await Promise.all([
      projectMentionables(project.id, user.id, memberNames, memberAvatars, memberRoles),
      loadPeerCursors(threadId, user.id, peerReads, peerDeliveries),
    ]);
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
      memberAvatars,
      memberRoles,
      peerMemberIds,
      mentionables,
      peerReads,
      peerDeliveries,
      inactive: !getActiveContract(project.contracts),
      readOnly: false,
      replyOnly: false,
      isClientRoom: false,
    };
  }

  if (threadId === ANNOUNCEMENTS_THREAD_ID) {
    if (!canReadAnnouncements(user)) throw notFound();
    await getOrCreateAnnouncementsConversation();
    const [staff] = await Promise.all([
      prisma.user.findMany({
        where: { systemRole: { not: "CLIENT" }, blocked: false },
        select: { id: true, name: true, email: true, imageUrl: true },
      }),
      loadPeerCursors(threadId, user.id, peerReads, peerDeliveries),
    ]);
    for (const m of staff) {
      memberNames[m.id] = m.name ?? m.email;
      memberAvatars[m.id] = m.imageUrl ?? null;
      memberRoles[m.id] = "Staff";
    }
    return {
      threadId,
      kind: "announcements",
      target: { conversationId: ANNOUNCEMENTS_CONVERSATION_ID },
      channel: conversationChannel(ANNOUNCEMENTS_CONVERSATION_ID),
      title: ANNOUNCEMENTS_TITLE,
      subtitle: ANNOUNCEMENTS_SUBTITLE,
      avatarUrl: null,
      memberNames,
      memberAvatars,
      memberRoles,
      peerMemberIds: staff.map((m) => m.id).filter((id) => id !== user.id),
      mentionables: staff
        .filter((m) => m.id !== user.id)
        .map((m) => ({ id: m.id, name: m.name ?? m.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      peerReads,
      peerDeliveries,
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
    const [convo] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              member: { select: { id: true, name: true, email: true, imageUrl: true } },
            },
          },
          project: { select: { contracts: { select: CONTRACT_SELECT } } },
        },
      }),
      loadPeerCursors(threadId, user.id, peerReads, peerDeliveries),
    ]);
    if (!convo) throw notFound();
    for (const p of convo.participants) {
      memberNames[p.member.id] = p.member.name ?? p.member.email;
      memberAvatars[p.member.id] = p.member.imageUrl ?? null;
      memberRoles[p.member.id] = client && p.member.id === user.id ? "You" : "Member";
      if (p.memberId !== user.id && p.lastReadAt) {
        setNewer(peerReads, p.memberId, p.lastReadAt.toISOString());
        setNewer(peerDeliveries, p.memberId, p.lastReadAt.toISOString());
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
      memberAvatars,
      memberRoles,
      peerMemberIds: others.map((m) => m.id),
      mentionables: others
        .map((m) => ({ id: m.id, name: m.name ?? m.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      peerReads,
      peerDeliveries,
      inactive:
        !access.project.clientChatEnabled ||
        !getActiveContract(convo.project?.contracts ?? []),
      readOnly: !access.canPost,
      replyOnly: false,
      isClientRoom: true,
    };
  }

  if (client) throw notFound();
  const [convo] = await Promise.all([
    prisma.conversation.findFirst({
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
    }),
    loadPeerCursors(threadId, user.id, peerReads, peerDeliveries),
  ]);
  if (!convo) throw notFound();

  for (const p of convo.participants) {
    memberNames[p.member.id] = p.member.name ?? p.member.email;
    memberAvatars[p.member.id] = p.member.imageUrl ?? null;
    memberRoles[p.member.id] = "Member";
    if (p.memberId !== user.id && p.lastReadAt) {
      setNewer(peerReads, p.memberId, p.lastReadAt.toISOString());
      setNewer(peerDeliveries, p.memberId, p.lastReadAt.toISOString());
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
    memberAvatars,
    memberRoles,
    peerMemberIds,
    peerReads,
    peerDeliveries,
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
      mentionables: await projectMentionables(
        note.projectId,
        user.id,
        memberNames,
        memberAvatars,
        memberRoles,
      ),
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
      mentionables: await projectMentionables(
        task.projectId,
        user.id,
        memberNames,
        memberAvatars,
        memberRoles,
      ),
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

function setNewer(map: Record<string, string>, id: string, iso: string) {
  const prev = map[id];
  if (!prev || new Date(iso).getTime() > new Date(prev).getTime()) {
    map[id] = iso;
  }
}

async function loadPeerCursors(
  threadId: string,
  viewerId: string,
  peerReads: Record<string, string>,
  peerDeliveries: Record<string, string>,
) {
  const cursors = await prisma.chatReadCursor.findMany({
    where: { threadId, userId: { not: viewerId } },
    select: { userId: true, lastReadAt: true, lastDeliveredAt: true },
  });
  for (const c of cursors) {
    const readIso = c.lastReadAt.toISOString();
    setNewer(peerReads, c.userId, readIso);
    // Reading implies delivered; take whichever timestamp is newer.
    setNewer(peerDeliveries, c.userId, readIso);
    if (c.lastDeliveredAt) {
      setNewer(peerDeliveries, c.userId, c.lastDeliveredAt.toISOString());
    }
  }
}

/** Project members minus the viewer; also fills names, avatars, and roles for everyone. */
async function projectMentionables(
  projectId: string,
  viewerId: string,
  memberNames: Record<string, string>,
  memberAvatars: Record<string, string | null>,
  memberRoles: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: {
      role: true,
      projectRole: { select: { name: true, isClient: true } },
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  });
  const out: { id: string; name: string }[] = [];
  for (const row of members) {
    const user = row.user;
    const name = user.name ?? user.email;
    memberNames[user.id] = name;
    memberAvatars[user.id] = user.imageUrl ?? null;
    memberRoles[user.id] =
      row.projectRole?.name ??
      (row.role === "CLIENT" || row.projectRole?.isClient ? "Client" : titleCaseRole(row.role));
    if (user.id !== viewerId) out.push({ id: user.id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function titleCaseRole(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "PROJECT_MANAGER":
      return "Project manager";
    case "CLIENT":
      return "Client";
    case "MEMBER":
    default:
      return "Member";
  }
}
