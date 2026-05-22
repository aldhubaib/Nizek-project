"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION";
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

  const note = await prisma.meetingNote.create({
    data: {
      title: data.title,
      content: data.content,
      date: new Date(data.date),
      noteType: data.noteType ?? "MEETING_NOTE",
      projectId: data.projectId,
      authorId: user.id,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return note;
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

  const { member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot edit notes");

  const updated = await prisma.meetingNote.update({
    where: { id: data.noteId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.date && { date: new Date(data.date) }),
    },
  });

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
    include: { author: true },
    orderBy: { date: "desc" },
  });
}
