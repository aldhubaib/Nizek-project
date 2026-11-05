"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { stripPlanningTaskAssignees } from "@/lib/sprint-planning-doc";

export type ClientNoteDoc = {
  title: string;
  content: string;
};

/**
 * A note as a client may read it: the title and the body, and nothing else.
 *
 * Deliberately not `getMeetingNote`. That one includes taskLinks, comment
 * threads, edit history and reminder logs — the team's working record around
 * the document, which is not the client's to read. Selecting the two columns
 * here means there is no filtering step to forget: the rest never loads.
 *
 * The body still passes through the assignee stripper: who is working on each
 * task in a sprint document is the team's business, not the client's.
 */
export async function getClientNoteDoc(input: {
  projectId: string;
  noteId: string;
}): Promise<ClientNoteDoc> {
  const { user } = await requireProjectMember(input.projectId);
  if (!isClientUser(user)) throw new Error("Permission denied");

  // Scoped to the project they were checked against, so a note id from another
  // project cannot be read by passing this project's id alongside it.
  const note = await prisma.meetingNote.findFirst({
    where: { id: input.noteId, projectId: input.projectId },
    select: { title: true, content: true },
  });
  if (!note) throw new Error("Note not found");

  return {
    title: note.title,
    content: stripPlanningTaskAssignees(note.content),
  };
}
