"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMeetingNote, getMeetingNotes } from "@/actions/meeting-note";
import { splitChildId } from "@/next-ui/panes/pane-kinds";

/** A project's notes and one note, through the existing server actions. A note pane's id is `<projectId>_<noteId>`. */

export type NoteRow = Awaited<ReturnType<typeof getMeetingNotes>>[number];
export type NoteDetail = Awaited<ReturnType<typeof getMeetingNote>>;

export const projectNotesKey = (projectId: string) => ["projects", projectId, "notes"] as const;
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
