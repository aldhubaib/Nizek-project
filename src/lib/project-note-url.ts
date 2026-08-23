// The Roadmap tab merged into Notes; every note now lives under the Notes tab.
export function projectNoteTab(_noteType?: string | null): "notes" {
  return "notes";
}

export function isRoadmapNote(noteType?: string | null): boolean {
  return noteType === "DEADLINE";
}

export function projectNoteUrl(
  projectId: string,
  noteId: string,
  options?: { noteType?: string | null; threadId?: string | null },
): string {
  const params = new URLSearchParams({
    tab: projectNoteTab(options?.noteType),
    noteId,
  });
  if (options?.threadId) params.set("threadId", options.threadId);
  return `/dashboard/projects/${projectId}?${params.toString()}`;
}
