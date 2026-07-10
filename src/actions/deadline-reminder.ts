"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEADLINE_MILESTONES,
  type DeadlineMilestone,
  milestoneLabel,
} from "@/lib/deadline-milestones";
import {
  daysUntilDue,
  isDeadlineTestProject,
  sendDeadlineReminderForNote,
} from "@/lib/deadline-reminders";

function projectScopeWhere(user: { id: string; systemRole: string }) {
  if (user.systemRole === "ADMIN") return {};
  if (user.systemRole === "PM" || user.systemRole === "TECH_LEAD") {
    return {
      OR: [
        { members: { some: { userId: user.id } } },
        { team: { members: { some: { userId: user.id } } } },
      ],
    };
  }
  return { members: { some: { userId: user.id } } };
}

function notLatePaymentFilter() {
  const now = new Date();
  return {
    contracts: {
      none: {
        latePayment: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    },
  };
}

export type IncompleteDeadlineRow = {
  id: string;
  title: string;
  dueDate: Date;
  daysUntil: number;
  project: { id: string; name: string };
  author: { id: string; name: string | null; imageUrl: string | null };
};

export async function getIncompleteDeadlines(): Promise<IncompleteDeadlineRow[]> {
  const user = await requireUser();
  const now = new Date();

  const notes = await prisma.meetingNote.findMany({
    where: {
      noteType: "DEADLINE",
      completedAt: null,
      dueDate: { not: null },
      project: { ...projectScopeWhere(user), ...notLatePaymentFilter() },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      project: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });

  return notes
    .filter((n): n is typeof n & { dueDate: Date } => n.dueDate !== null)
    .map((n) => ({
      id: n.id,
      title: n.title,
      dueDate: n.dueDate,
      daysUntil: daysUntilDue(n.dueDate, now),
      project: n.project,
      author: n.author,
    }));
}

export async function testDeadlineReminder(
  noteId: string,
  offsetDays: DeadlineMilestone,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") {
    return { ok: false, error: "Admin only" };
  }

  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    select: { projectId: true },
  });
  if (!note) return { ok: false, error: "Note not found" };
  if (!(await isDeadlineTestProject(note.projectId))) {
    return {
      ok: false,
      error: 'Test reminders are only allowed on the project named "test"',
    };
  }

  const result = await sendDeadlineReminderForNote({
    noteId,
    offsetDays,
    authorId: user.id,
    force: true,
    skipActiveContractCheck: true,
  });

  if (!result.ok) return { ok: false, error: result.reason };
  return { ok: true };
}

export async function getDeadlineMilestoneOptions() {
  return DEADLINE_MILESTONES.map((offsetDays) => ({
    offsetDays,
    label: milestoneLabel(offsetDays),
  }));
}
