import { projectNoteUrl } from "@/lib/project-note-url";

const PAYLOAD_PREFIX = "<!--note-activity:";

export type NoteActivityPayload = {
  noteId: string;
  projectId: string;
  projectName?: string;
  noteTitle: string;
  noteType: string;
  action: "created" | "updated" | "published";
  fields?: string[];
  excerpt?: string;
};

const TYPE_LABEL: Record<string, string> = {
  MEETING_NOTE: "Meeting Note",
  DECISION: "Decision",
  CLARIFICATION: "Clarification",
  DEADLINE: "RoadMap",
  SPRINT_PLANNING: "Sprint Planning",
  SPRINT_REVIEW: "Sprint Review",
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

export function noteActivityCategory(payload: NoteActivityPayload): string {
  const typeLabel = TYPE_LABEL[payload.noteType] ?? "Note";
  if (payload.action === "published") return typeLabel;
  return payload.action === "created"
    ? `${typeLabel} Created`
    : `${typeLabel} Created edited`;
}

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

export function noteActivityUrl(projectId: string, noteId: string, noteType?: string): string {
  return projectNoteUrl(projectId, noteId, { noteType });
}

export function noteActivityPreview(payload: NoteActivityPayload): string {
  const title = payload.noteTitle.trim() || "Untitled";
  return `${noteActivityCategory(payload)} · ${title}`;
}
