"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import { logTaskActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION" | "DEADLINE" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  dueDate?: string;
  taskId?: string;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

  if (data.noteType === "DEADLINE" && !data.dueDate) {
    throw new Error("Due date is required for deadlines");
  }

  const note = await prisma.meetingNote.create({
    data: {
      title: data.title,
      content: data.content,
      date: new Date(data.date),
      noteType: data.noteType ?? "MEETING_NOTE",
      projectId: data.projectId,
      authorId: user.id,
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
      ...(data.taskId && { taskId: data.taskId }),
    },
  });

  if (data.taskId) {
    await logTaskActivity({
      taskId: data.taskId,
      userId: user.id,
      action: "note_created",
      field: "note",
      newValue: data.title,
    });
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return note;
}

export async function toggleDeadlineComplete(noteId: string): Promise<Date | null> {
  const note = await prisma.meetingNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.noteType !== "DEADLINE") throw new Error("Not a deadline");

  await requireProjectMember(note.projectId);

  const completedAt = note.completedAt ? null : new Date();
  await prisma.meetingNote.update({
    where: { id: noteId },
    data: { completedAt },
  });

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return completedAt;
}

export async function updateMeetingNote(data: {
  noteId: string;
  title?: string;
  content?: string;
  date?: string;
}) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: data.noteId },
    include: { project: true },
  });
  if (!note) throw new Error("Note not found");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot edit notes");

  const historyEntries: { field: string; oldValue: string | null; newValue: string | null; noteId: string; userId: string }[] = [];

  if (data.title && data.title !== note.title) {
    historyEntries.push({
      field: "title",
      oldValue: note.title,
      newValue: data.title,
      noteId: note.id,
      userId: user.id,
    });
  }

  if (data.content !== undefined && data.content !== note.content) {
    historyEntries.push({
      field: "content",
      oldValue: null,
      newValue: null,
      noteId: note.id,
      userId: user.id,
    });
  }

  const [updated] = await prisma.$transaction([
    prisma.meetingNote.update({
      where: { id: data.noteId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.date && { date: new Date(data.date) }),
      },
    }),
    ...(historyEntries.length > 0
      ? [prisma.noteHistory.createMany({ data: historyEntries })]
      : []),
  ]);

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return updated;
}

export async function deleteMeetingNote(noteId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    include: { project: true },
  });
  if (!note) throw new Error("Note not found");

  await requireProjectRole(note.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  await prisma.meetingNote.delete({ where: { id: noteId } });
  revalidatePath(`/dashboard/projects/${note.projectId}`);
}

export async function getMeetingNotes(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.meetingNote.findMany({
    where: { projectId },
    include: {
      author: true,
      task: { select: { id: true, title: true, taskNumber: true, taskType: true } },
    },
    orderBy: { date: "desc" },
  });
}

export async function getTaskNotes(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw new Error("Task not found");

  await requireProjectMember(task.projectId);

  return prisma.meetingNote.findMany({
    where: { taskId },
    include: { author: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getNoteHistory(noteId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    select: { projectId: true },
  });
  if (!note) throw new Error("Note not found");

  await requireProjectMember(note.projectId);

  return prisma.noteHistory.findMany({
    where: { noteId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}
