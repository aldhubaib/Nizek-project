import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getActiveContract } from "@/lib/contract-rules";
import { broadcast, projectChannel, userChannel } from "@/lib/centrifugo";
import { createAndPublishNotifications } from "@/lib/notify";
import { sendPush } from "@/lib/push";
import type { DeadlineMilestone } from "@/lib/deadline-milestones";
import { DEADLINE_MILESTONES } from "@/lib/deadline-milestones";
import { getProjectMentionMembers } from "@/lib/project-mentions";

/** Days until due: positive = before due, 0 = due today, negative = overdue. */
export {
  DEADLINE_MILESTONES,
  type DeadlineMilestone,
  milestoneLabel,
} from "@/lib/deadline-milestones";

/** The project named exactly this (case-insensitive) is used for admin reminder tests. */
export const DEADLINE_TEST_PROJECT_NAME = "test";

export function isDeadlineTestProjectByName(name: string): boolean {
  return name.trim().toLowerCase() === DEADLINE_TEST_PROJECT_NAME;
}

/** Optional env override if you ever need a different project by id. */
export function getDeadlineTestProjectIdOverride(): string | null {
  const id = process.env.DEADLINE_REMINDER_TEST_PROJECT_ID?.trim();
  return id || null;
}

export async function isDeadlineTestProject(projectId: string): Promise<boolean> {
  const override = getDeadlineTestProjectIdOverride();
  if (override && override === projectId) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  return project ? isDeadlineTestProjectByName(project.name) : false;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function daysUntilDue(dueDate: Date, now = new Date()): number {
  const due = startOfUtcDay(dueDate);
  const today = startOfUtcDay(now);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function buildReminderText(
  title: string,
  dueDate: Date,
  offsetDays: DeadlineMilestone,
): string {
  const dueStr = format(dueDate, "MMM d, yyyy");
  if (offsetDays > 0) {
    return `⏰ Deadline reminder: "${title}" is due in ${offsetDays} days (${dueStr}).`;
  }
  if (offsetDays === 0) {
    return `⏰ Deadline reminder: "${title}" is due today (${dueStr}).`;
  }
  return `⚠️ Deadline overdue: "${title}" was due ${Math.abs(offsetDays)} days ago (${dueStr}).`;
}

function buildMentionBody(
  members: { id: string; name: string | null; email: string }[],
  text: string,
): string {
  const tokens = members
    .map((m) => `@[${m.name ?? m.email}](${m.id})`)
    .join(" ");
  return `${tokens}\n\n${text}`;
}

function toDisplayBody(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

export async function sendDeadlineReminderForNote(options: {
  noteId: string;
  offsetDays: DeadlineMilestone;
  authorId: string;
  force?: boolean;
  skipActiveContractCheck?: boolean;
}): Promise<{ ok: true; messageId: string } | { ok: false; reason: string }> {
  const note = await prisma.meetingNote.findUnique({
    where: { id: options.noteId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          contracts: {
            select: {
              id: true,
              contractType: true,
              label: true,
              startDate: true,
              endDate: true,
              latePayment: true,
            },
          },
        },
      },
    },
  });

  if (!note) return { ok: false, reason: "Note not found" };
  if (note.noteType !== "DEADLINE") return { ok: false, reason: "Not a deadline note" };
  if (note.completedAt) return { ok: false, reason: "Deadline already completed" };
  if (!note.dueDate) return { ok: false, reason: "Missing due date" };

  if (!options.skipActiveContractCheck && !getActiveContract(note.project.contracts)) {
    return { ok: false, reason: "Project is not active" };
  }

  if (!options.force) {
    const existing = await prisma.deadlineReminderLog.findUnique({
      where: {
        noteId_offsetDays: {
          noteId: note.id,
          offsetDays: options.offsetDays,
        },
      },
    });
    if (existing) return { ok: false, reason: "Reminder already sent for this milestone" };
  }

  const members = await getProjectMentionMembers(note.projectId);
  if (members.length === 0) return { ok: false, reason: "No project members to mention" };

  const text = buildReminderText(note.title, note.dueDate, options.offsetDays);
  const body = buildMentionBody(members, text);
  const mentionIds = members.map((m) => m.id);

  const author = await prisma.user.findUnique({
    where: { id: options.authorId },
    select: { id: true, name: true, email: true, imageUrl: true },
  });
  if (!author) return { ok: false, reason: "Author not found" };

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        projectId: note.projectId,
        authorId: options.authorId,
        body,
        kind: "deadline_reminder",
        mentions: {
          create: mentionIds.map((memberId) => ({ memberId })),
        },
      },
      include: {
        attachments: {
          select: { id: true, filename: true, url: true, fileSize: true, mimeType: true },
        },
      },
    });

    await tx.deadlineReminderLog.upsert({
      where: {
        noteId_offsetDays: {
          noteId: note.id,
          offsetDays: options.offsetDays,
        },
      },
      create: {
        noteId: note.id,
        offsetDays: options.offsetDays,
      },
      update: {
        sentAt: new Date(),
      },
    });

    return created;
  });

  const authorName = author.name ?? author.email ?? "System";
  const displayBody = toDisplayBody(body);
  const preview =
    displayBody.length > 80 ? `${displayBody.slice(0, 80)}…` : displayBody;
  const linkUrl = `/dashboard/messages/project-${note.projectId}`;

  const dto = {
    id: message.id,
    taskId: null,
    projectId: note.projectId,
    conversationId: null,
    kind: "deadline_reminder",
    authorId: options.authorId,
    authorName,
    authorImageUrl: author.imageUrl ?? null,
    body: displayBody,
    createdAt: message.createdAt.toISOString(),
    attachments: [],
    replyToId: null,
    task: null,
    mentions: members.map((m) => m.name ?? m.email),
  };

  void broadcast([projectChannel(note.projectId)], {
    type: "message.new",
    message: dto,
  });

  const recipients = mentionIds.filter((id) => id !== options.authorId);
  if (recipients.length > 0) {
    const title = `Deadline: ${note.title}`;
    await createAndPublishNotifications({
      recipientIds: recipients,
      type: "mention",
      title,
      body: preview,
      linkUrl,
    });
    void sendPush(recipients, {
      title,
      body: preview,
      url: linkUrl,
      tag: `deadline-${note.id}-${options.offsetDays}`,
    });
  }

  const inboxTargets = [...new Set([options.authorId, ...mentionIds])];
  void broadcast(inboxTargets.map(userChannel), {
    type: "inbox",
    threadId: `project-${note.projectId}`,
    projectId: note.projectId,
    taskId: null,
    conversationId: null,
    authorId: options.authorId,
    lastAuthor: authorName,
    lastMessage: preview,
    lastAt: new Date().toISOString(),
  });

  return { ok: true, messageId: message.id };
}

export async function processDeadlineReminders(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
}> {
  const notes = await prisma.meetingNote.findMany({
    where: {
      noteType: "DEADLINE",
      completedAt: null,
      dueDate: { not: null },
    },
    select: {
      id: true,
      dueDate: true,
      authorId: true,
      project: {
        select: {
          contracts: {
            select: {
              id: true,
              contractType: true,
              label: true,
              startDate: true,
              endDate: true,
              latePayment: true,
            },
          },
        },
      },
    },
  });

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const note of notes) {
    if (!note.dueDate) continue;
    if (!getActiveContract(note.project.contracts)) {
      skipped++;
      continue;
    }

    const days = daysUntilDue(note.dueDate, now);
    if (!DEADLINE_MILESTONES.includes(days as DeadlineMilestone)) {
      skipped++;
      continue;
    }

    const result = await sendDeadlineReminderForNote({
      noteId: note.id,
      offsetDays: days as DeadlineMilestone,
      authorId: note.authorId,
    });

    if (result.ok) sent++;
    else skipped++;
  }

  return { processed: notes.length, sent, skipped };
}
