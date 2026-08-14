const PAYLOAD_PREFIX = "<!--note-activity:";

export type NoteActivityPayload = {
  noteId: string;
  projectId: string;
  noteTitle: string;
  noteType: string;
  action: "created" | "updated";
  fields?: string[];
};

export function encodeNoteActivityBody(payload: NoteActivityPayload): string {
  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeNoteActivityPayload(body: string): NoteActivityPayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  if (idx === -1) return null;
  const start = idx + PAYLOAD_PREFIX.length;
  const raw = body.slice(start);
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  try {
    return JSON.parse(raw.slice(0, end + 1)) as NoteActivityPayload;
  } catch {
    return null;
  }
}

export function isNoteActivityMessage(kind: string): boolean {
  return kind === "note_activity";
}

export function noteActivityUrl(projectId: string, noteId: string): string {
  return `/dashboard/projects/${projectId}?tab=notes&noteId=${noteId}`;
}

export function noteActivityPreview(payload: NoteActivityPayload): string {
  const title = payload.noteTitle.trim() || "Untitled";
  return payload.action === "created"
    ? `created the note “${title}”`
    : `updated the note “${title}”`;
}
