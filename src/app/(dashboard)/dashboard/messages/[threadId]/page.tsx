import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasProjectAccess } from "@/lib/project-access";
import {
  taskChannel,
  projectChannel,
  conversationChannel,
  globalPresenceChannel,
  userChannel,
  NOTIFICATION_READ,
} from "@/lib/channels";
import { publish } from "@/lib/centrifugo";
import { getThreadMessages } from "@/actions/messages";
import { getActiveContract } from "@/lib/contract-rules";
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
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireUser();

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

  if (threadId.startsWith("task-")) {
    const taskId = threadId.slice(5);
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        projectId: true,
        project: { select: { name: true, contracts: { select: CONTRACT_SELECT } } },
      },
    });
    if (!task) notFound();
    if (!(await hasProjectAccess(task.projectId))) notFound();
    target = { taskId: task.id, projectId: task.projectId };
    channel = taskChannel(task.id);
    presenceChannel = taskChannel(task.id);
    title = task.title;
    subtitle = task.project.name;
    inactive = !getActiveContract(task.project.contracts);
  } else if (threadId.startsWith("project-")) {
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
    inactive = !getActiveContract(project.contracts);
  } else if (threadId.startsWith("conv-")) {
    const conversationId = threadId.slice(5);
    const convo = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { memberId: user.id } },
      },
      include: {
        participants: {
          include: { member: { select: { id: true, name: true, email: true } } },
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
    mentionables = others.map((m) => ({ id: m.id, name: m.name ?? m.email }));
    target = { conversationId: convo.id };
    channel = conversationChannel(convo.id);
    presenceChannel = globalPresenceChannel();
    title =
      convo.title ??
      (others.map((m) => m.name ?? m.email).join(", ") || "Direct message");
    subtitle = convo.isGroup ? `${convo.participants.length} members` : "Direct message";
  } else {
    notFound();
  }

  // People involved in a project/task thread: project members plus system
  // admins (who can access every project without being explicit members).
  if (target.projectId) {
    const [projectMembers, admins] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId: target.projectId },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.user.findMany({
        where: { systemRole: "ADMIN" },
        select: { id: true, name: true, email: true },
      }),
    ]);
    const map = new Map<string, { id: string; name: string }>();
    for (const m of [...projectMembers.map((pm) => pm.user), ...admins]) {
      map.set(m.id, { id: m.id, name: m.name ?? m.email });
    }
    map.delete(user.id);
    mentionables = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Latest page only (50 messages) — older pages load on demand in the client.
  const page = await getThreadMessages(target);

  // Mark this thread's notifications as read.
  const linkUrl = target.conversationId
    ? `/dashboard/messages/conv-${target.conversationId}`
    : target.taskId
      ? `/dashboard/projects/${target.projectId}/tasks/${target.taskId}`
      : `/dashboard/messages/project-${target.projectId}`;
  const toMark = await prisma.notification.findMany({
    where: { recipientId: user.id, read: false, linkUrl },
    select: { id: true },
  });
  if (toMark.length > 0) {
    await prisma.notification.updateMany({
      where: { recipientId: user.id, read: false, linkUrl },
      data: { read: true, readAt: new Date() },
    });
    const unread = await prisma.notification.count({
      where: { recipientId: user.id, read: false },
    });
    // Sync read-state to the user's other devices/tabs (bell + app badge).
    void publish(userChannel(user.id), {
      type: NOTIFICATION_READ,
      ids: toMark.map((n) => n.id),
      unread,
    });
  }

  return (
    <ThreadChat
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
      readOnly={false}
    />
  );
}
