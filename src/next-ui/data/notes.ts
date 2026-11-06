"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createMeetingNote, deleteMeetingNote, getMeetingNote, getMeetingNotes, toggleDeadlineComplete, updateMeetingNote } from "@/actions/meeting-note";
import { saveNoteBody } from "@/actions/note-body";
import { splitChildId } from "@/next-ui/panes/pane-kinds";

import { projectNotesKey } from "./keys";
import { projectKey } from "./projects";

/**
 * A project's notes and one note, through the existing server actions, and the changes to
 * them: a new note, its title, text and dates, marking a road-map item done, deleting it. A
 * note pane's id is `<projectId>_<noteId>`. Sprint documents are written by the sprint itself
 * (its plan and review), never edited as text here.
 */

export type NoteRow = Awaited<ReturnType<typeof getMeetingNotes>>[number];
export type NoteDetail = Awaited<ReturnType<typeof getMeetingNote>>;
export type NewNoteInput = Omit<Parameters<typeof createMeetingNote>[0], "projectId">;
export type NoteChanges = Omit<Parameters<typeof updateMeetingNote>[0], "noteId">;

export { projectNotesKey };
export const noteKey = (noteId: string) => ["notes", noteId] as const;

export function useProjectNotes(projectId: string) {
  return useQuery({
    queryKey: projectNotesKey(projectId),
    queryFn: () => getMeetingNotes(projectId),
    enabled: projectId !== "",
  });
}

/** One note: from the project's list when it is loaded (same shape), else fetched on its own. */
export function useNote(projectId: string, noteId: string) {
  const qc = useQueryClient();
  const fromList = qc.getQueryData<NoteRow[]>(projectNotesKey(projectId))?.find((n) => n.id === noteId);
  const record = useQuery({
    queryKey: noteKey(noteId),
    queryFn: () => getMeetingNote(noteId),
    enabled: noteId !== "" && !fromList,
  });
  return { data: (fromList as NoteDetail | undefined) ?? record.data, isPending: !fromList && record.isPending, error: fromList ? null : record.error };
}

export function useNoteLabel(paneId: string): string | undefined {
  const ids = splitChildId(paneId);
  const note = useNote(ids?.parent ?? "", ids?.child ?? "");
  return note.data?.title;
}

/** After any change to the notes: the list, the project's counts and the changed note's own record. */
export function useNotesRefresh(projectId: string) {
  const qc = useQueryClient();
  return (noteId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectNotesKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
      noteId ? qc.invalidateQueries({ queryKey: noteKey(noteId) }) : Promise.resolve(),
    ]).then(() => undefined);
}

export function useCreateNote(projectId: string) {
  const refresh = useNotesRefresh(projectId);
  return useMutation({ mutationFn: (input: NewNoteInput) => createMeetingNote({ projectId, ...input }), onSettled: () => refresh() });
}

/**
 * A note's title, date, due date, effort — and its body, which goes through `saveNoteBody` so
 * the live panel's collaborative copy does not shadow it.
 */
export function useUpdateNote(projectId: string) {
  const refresh = useNotesRefresh(projectId);
  return useMutation({
    mutationFn: async ({ noteId, content, ...changes }: NoteChanges & { noteId: string }) => {
      const rest = Object.keys(changes).length > 0 ? await updateMeetingNote({ noteId, ...changes }) : null;
      return content !== undefined ? saveNoteBody({ noteId, content }) : rest;
    },
    onSettled: (_r, _e, input) => refresh(input.noteId),
  });
}

/** A road-map item (a "Deadline" note) done, or open again. */
export function useToggleNoteDone(projectId: string) {
  const refresh = useNotesRefresh(projectId);
  return useMutation({ mutationFn: (noteId: string) => toggleDeadlineComplete(noteId), onSettled: (_r, _e, noteId) => refresh(noteId) });
}

export function useDeleteNote(projectId: string) {
  const qc = useQueryClient();
  const refresh = useNotesRefresh(projectId);
  return useMutation({
    mutationFn: (noteId: string) => deleteMeetingNote(noteId),
    onSuccess: (_r, noteId) => {
      qc.setQueryData<NoteRow[]>(projectNotesKey(projectId), (prev) => prev?.filter((n) => n.id !== noteId));
    },
    onSettled: (_r, _e, noteId) => refresh(noteId),
  });
}
