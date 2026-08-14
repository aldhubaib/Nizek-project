const PAYLOAD_PREFIX = "<!--note-comment:";

export type NoteCommentPayload = {
  noteId: string;
  projectId: string;
  threadId: string;
  noteTitle: string;
  quoteText: string;
  comment: string;
};

export function encodeNoteCommentBody(
  payload: NoteCommentPayload,
  mentionTokens: string[],
): string {
  const header = mentionTokens.length ? `${mentionTokens.join(" ")}\n` : "";
  return `${header}${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeNoteCommentPayload(body: string): NoteCommentPayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  if (idx === -1) return null;
  const start = idx + PAYLOAD_PREFIX.length;
  const raw = body.slice(start);
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  try {
    return JSON.parse(raw.slice(0, end + 1)) as NoteCommentPayload;
  } catch {
    return null;
  }
}

export function isNoteCommentMessage(kind: string): boolean {
  return kind === "note_comment";
}

export function noteCommentUrl(
  projectId: string,
  noteId: string,
  threadId: string,
): string {
  return `/dashboard/projects/${projectId}?tab=notes&noteId=${noteId}&threadId=${threadId}`;
}

export function noteCommentPreview(payload: NoteCommentPayload): string {
  const snippet = payload.comment.replace(/\s+/g, " ").trim().slice(0, 80);
  return snippet || `Comment on "${payload.noteTitle}"`;
}
