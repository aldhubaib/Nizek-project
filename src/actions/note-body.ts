"use server";

import { updateMeetingNote } from "@/actions/meeting-note";
import { prisma } from "@/lib/prisma";

/**
 * A note's body written from a plain editor (the new panel's), not the collaborative one.
 *
 * The live panel edits notes through the collaboration server, which keeps a second copy of
 * the body (`ydoc`) and reads that copy first whenever it has one. A body saved only as HTML
 * would then be shadowed the next time the note was opened there, and overwritten the first
 * time it was saved. So the same `updateMeetingNote` runs (its rights, its history row), and
 * the collaborative copy is dropped: the next collaborative open seeds from this HTML.
 */
export async function saveNoteBody(input: { noteId: string; content: string }) {
  const updated = await updateMeetingNote({ noteId: input.noteId, content: input.content });
  await prisma.meetingNote.update({ where: { id: input.noteId }, data: { ydoc: null } });
  return updated;
}
