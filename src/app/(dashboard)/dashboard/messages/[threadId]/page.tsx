import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import {
  taskChannel,
  projectChannel,
  conversationChannel,
  conversationClientChannel,
  globalPresenceChannel,
} from "@/lib/channels";
import { getAliasMap, maskName, maskPlainNames } from "@/lib/alias";
import { getThreadMessages, getInboxThreads } from "@/actions/messages";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import {
  getAdminPermissions,
  getPermissionsFromRole,
} from "@/lib/permissions";
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
import { ThreadChat, type ThreadTarget } from "./thread-chat";

const CONTRACT_SELECT = {
  id: true,
  contractType: true,
  label: true,
  startDate: true,
  endDate: true,
  latePayment: true,
} as const;

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ msg?: string; panel?: string; tab?: string }>;
}) {
  const { threadId } = await params;
  const { msg: focusMessageId, panel, tab } = await searchParams;
  const user = await requireUser();
  const client = isClientUser(user);

  // Thread id encodes the kind: task-<id>, project-<id>, or conv-<id>.
  let target: ThreadTarget = {};
  let channel = "";
  let presenceChannel: string | null = null;
  let title = "";
  let subtitle = "";
  let peerMemberIds: string[] = [];
  const memberNames: Record<string, string> = {};
  // Who can be @mentioned in this thread's composer.
  let mentionables: { id: string; name: string }[] = [];
  // Project chat/task threads are read-only when the project has no active
  // contract (mirrors Falak: inactive projects have a read-only channel).
  let inactive = false;
  let readOnly = false;
  // Announcements: everyone reads and reacts, but only admins start a thread.
  let replyOnly = false;
  let isClientRoom = false;

  let canCreateTask = false;
  let allowedTaskTypes: string[] = [];
  let activeContractType: string | null = null;
  let projectName: string | undefined;
  let peerLastReadAt: string | null = null;
  let contractsForPerms: Parameters<typeof getActiveContract>[0] = [];

  if (threadId.startsWith("task-")) {
    if (client) notFound();
    const taskId = threadId.slice(5);
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        projectId: true,
        project: {
          select: { name: true, contracts: { select: CONTRACT_SELECT } },
        },
      },
    });
    if (!task) notFound();
    if (!(await hasProjectAccess(task.projectId))) notFound();
    target = { taskId: task.id, projectId: task.projectId };
    channel = taskChannel(task.id);
    presenceChannel = taskChannel(task.id);
    title = task.title;
    subtitle = task.project.name;
    projectName = task.project.name;
    inactive = !getActiveContract(task.project.contracts);
    contractsForPerms = task.project.contracts;
  } else if (threadId.startsWith("project-")) {
    if (client) notFound();
    const projectId = threadId.slice(8);
    if (!(await hasProjectAccess(projectId))) notFound();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, contracts: { select: CONTRACT_SELECT } },
    });
    if (!project) notFound();
    target = { projectId: project.id };
    channel = projectChannel(project.id);
    presenceChannel = projectChannel(project.id);
    title = project.name;
    subtitle = "Project chat";
    projectName = project.name;
    inactive = !getActiveContract(project.contracts);
    contractsForPerms = project.contracts;
  } else if (threadId === ANNOUNCEMENTS_THREAD_ID) {
    if (!canReadAnnouncements(user)) notFound();
    await getOrCreateAnnouncementsConversation();

    // Membership is every non-client user, so there are no participant rows to
    // read — the audience doubles as the mention list.
    const staff = await prisma.user.findMany({
      where: { systemRole: { not: "CLIENT" }, blocked: false },
      select: { id: true, name: true, email: true },
    });
    for (const m of staff) memberNames[m.id] = m.name ?? m.email;
    mentionables = staff
      .filter((m) => m.id !== user.id)
      .map((m) => ({ id: m.id, name: m.name ?? m.email }))
      .sort((a, b) => a.name.localeCompare(b.name));

    target = { conversationId: ANNOUNCEMENTS_CONVERSATION_ID };
    channel = conversationChannel(ANNOUNCEMENTS_CONVERSATION_ID);
    presenceChannel = globalPresenceChannel();
    title = ANNOUNCEMENTS_TITLE;
    subtitle = ANNOUNCEMENTS_SUBTITLE;
    replyOnly = !canPostAnnouncement(user);
  } else if (threadId.startsWith("conv-")) {
    const conversationId = threadId.slice(5);
    const convoMeta = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, kind: true },
    });
    if (!convoMeta) notFound();

    if (convoMeta.kind === CLIENT_CONVERSATION_KIND) {
      const access = await canAccessClientConversation(conversationId, user);
      if (!access.ok || !access.conversation || !access.project) notFound();

      const convo = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              member: { select: { id: true, name: true, email: true } },
            },
          },
          project: {
            select: { contracts: { select: CONTRACT_SELECT } },
          },
        },
      });
      if (!convo) notFound();

      isClientRoom = true;
      const others = convo.participants
        .map((p) => p.member)
        .filter((m) => m.id !== user.id);
      for (const p of convo.participants) {
        memberNames[p.member.id] = p.member.name ?? p.member.email;
      }
      peerMemberIds = others.map((m) => m.id);
      mentionables = others
        .map((m) => ({ id: m.id, name: m.name ?? m.email }))
        .sort((a, b) => a.name.localeCompare(b.name));
      target = {
        conversationId: convo.id,
        projectId: access.project.id,
      };
      channel = conversationChannel(convo.id);
      presenceChannel = globalPresenceChannel();
      title = access.project.name;
      subtitle = client
        ? "Chatting with Nizek"
        : access.project.clientChatEnabled
          ? "Client chat"
          : "Client chat (disabled)";
      projectName = access.project.name;
      readOnly = !access.canPost;
      inactive =
        !access.project.clientChatEnabled ||
        !getActiveContract(convo.project?.contracts ?? []);
      // Never allow create-task from client rooms in v1.
      canCreateTask = false;
    } else {
      if (client) notFound();
      const convo = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { memberId: user.id } },
        },
        include: {
          participants: {
            include: {
              member: { select: { id: true, name: true, email: true } },
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
      if (!convo) notFound();
      const others = convo.participants
        .map((p) => p.member)
        .filter((m) => m.id !== user.id);
      for (const p of convo.participants) {
        memberNames[p.member.id] = p.member.name ?? p.member.email;
      }
      peerMemberIds = others.map((m) => m.id);
      mentionables = others.map((m) => ({
        id: m.id,
        name: m.name ?? m.email,
      }));
      if (convo.noteCommentThread) {
        const projectId = convo.noteCommentThread.note.projectId;
        const members = await prisma.projectMember.findMany({
          where: { projectId },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        mentionables = members
          .map((m) => ({
            id: m.user.id,
            name: m.user.name ?? m.user.email,
          }))
          .filter((m) => m.id !== user.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        subtitle = `${convo.noteCommentThread.note.project.name} · Note comment`;
        title = convo.noteCommentThread.note.title;
        projectName = convo.noteCommentThread.note.project.name;
      } else if (convo.taskHighlightThread) {
        const projectId = convo.taskHighlightThread.task.projectId;
        const members = await prisma.projectMember.findMany({
          where: { projectId },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        mentionables = members
          .map((m) => ({
            id: m.user.id,
            name: m.user.name ?? m.user.email,
          }))
          .filter((m) => m.id !== user.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        subtitle = `${convo.taskHighlightThread.task.project.name} · Task comment`;
        title = convo.taskHighlightThread.task.title;
        projectName = convo.taskHighlightThread.task.project.name;
      }
      target = { conversationId: convo.id };
      channel = conversationChannel(convo.id);
      presenceChannel = globalPresenceChannel();
      if (!convo.noteCommentThread && !convo.taskHighlightThread) {
        title =
          convo.title ??
          (others.map((m) => m.name ?? m.email).join(", ") || "Direct message");
        subtitle = convo.isGroup
          ? `${convo.participants.length} members`
          : "Direct message";
      }

      const peerReads = convo.participants
        .filter((p) => p.memberId !== user.id && p.lastReadAt)
        .map((p) => p.lastReadAt!.getTime());
      if (peerReads.length > 0) {
        peerLastReadAt = new Date(Math.max(...peerReads)).toISOString();
      }
    }
  } else {
    notFound();
  }

  // Project / task threads: only people on the project can be mentioned.
  // Skip for client rooms — mentionables are conversation participants only.
  if (target.projectId && !isClientRoom) {
    const [projectMembers, { user: memberUser, member }] =
      await Promise.all([
        prisma.projectMember.findMany({
          where: { projectId: target.projectId },
          select: { user: { select: { id: true, name: true, email: true } } },
        }),
        requireProjectMember(target.projectId),
      ]);
    const map = new Map<string, { id: string; name: string }>();
    for (const m of projectMembers.map((pm) => pm.user)) {
      map.set(m.id, { id: m.id, name: m.name ?? m.email });
      memberNames[m.id] = m.name ?? m.email;
    }
    map.delete(user.id);
    mentionables = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

    const isSystemAdmin = memberUser.systemRole === "ADMIN";
    const perms = isSystemAdmin
      ? getAdminPermissions()
      : getPermissionsFromRole(member.projectRole);
    canCreateTask =
      isSystemAdmin || perms.canCreateTask;

    const activeContract = getActiveContract(contractsForPerms);
    activeContractType = activeContract?.contractType ?? null;
    allowedTaskTypes = activeContract
      ? getAllowedTaskTypes(activeContract.contractType, isSystemAdmin)
      : [];
  }

  // Clients see aliases for everyone on the project, and read the separate
  // aliased realtime channel — the plain conv channel carries real names.
  if (client && target.conversationId) {
    const aliasMap = await getAliasMap(target.projectId);
    for (const [id, name] of Object.entries(memberNames)) {
      memberNames[id] = maskName(id, name, aliasMap);
    }
    mentionables = mentionables.map((m) => ({
      id: m.id,
      name: maskName(m.id, m.name, aliasMap),
    }));
    title = maskPlainNames(title, aliasMap);
    subtitle = maskPlainNames(subtitle, aliasMap);
    channel = conversationClientChannel(target.conversationId);
  }

  // Latest page only (50 messages) — older pages load on demand in the client.
  const page = await getThreadMessages(target);
  const clientThreadCount = client ? (await getInboxThreads()).length : 0;

  // Deliberately NO mark-as-read here: this Server Component also renders for
  // Next.js Link prefetches from the inbox list, and hovering a thread must
  // not mark it read. The client marks read (markThreadRead) once the thread
  // is actually on a visible screen.

  return (
    <ThreadChat
      key={threadId}
      channel={channel}
      presenceChannel={presenceChannel}
      target={target}
      title={title}
      subtitle={subtitle}
      currentMemberId={user.id}
      messages={page.messages}
      hasMoreOlder={page.hasMore}
      memberNames={memberNames}
      peerMemberIds={peerMemberIds}
      mentionables={mentionables}
      inactive={inactive}
      readOnly={readOnly}
      replyOnly={replyOnly}
      canCreateTask={canCreateTask}
      allowedTaskTypes={allowedTaskTypes}
      activeContractType={activeContractType}
      projectName={projectName}
      peerLastReadAt={peerLastReadAt}
      lastReadAt={page.lastReadAt}
      unreadCount={page.unreadCount}
      isClientRoom={isClientRoom}
      isClientUser={client}
      showInboxBack={!client || clientThreadCount > 1}
      focusMessageId={focusMessageId}
      initialPanel={panel}
      initialProjectTab={tab}
    />
  );
}
