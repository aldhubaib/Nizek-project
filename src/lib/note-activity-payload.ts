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
  /**
   * Sprint documents only. Clients have no project page to link to, so their
   * copy of the card opens the document inline — which needs the sprint the
   * planning or review belongs to.
   */
  sprintId?: string;
  /**
   * Scope-change cards only: the task that joined or left the running sprint.
   * It takes the place the approval button holds on a review card, because the
   * whole point of the announcement is which piece of work moved.
   */
  scopeTask?: { code: string; title: string };
};

export const SPRINT_TASK_ADDED = "SPRINT_TASK_ADDED";
export const SPRINT_TASK_REMOVED = "SPRINT_TASK_REMOVED";

export function isSprintScopeCard(noteType: string): boolean {
  return noteType === SPRINT_TASK_ADDED || noteType === SPRINT_TASK_REMOVED;
}

const TYPE_LABEL: Record<string, string> = {
  MEETING_NOTE: "Meeting Note",
  DECISION: "Decision",
  CLARIFICATION: "Clarification",
  DEADLINE: "RoadMap",
  SPRINT_PLANNING: "Sprint Planning",
  SPRINT_REVIEW: "Sprint Review",
  // No new cards carry this — the sprint announces itself at its own two
  // moments — but the ones written before that stopped are still in the history.
  SPRINT_DOC: "Sprint Document",
  SPRINT_TASK_ADDED: "Added to Sprint",
  SPRINT_TASK_REMOVED: "Removed from Sprint",
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

/**
 * Whether a card should quote the top of the document it announces.
 *
 * Sprint documents open with the same fixed introduction every time, so the
 * quote said nothing about the sprint it was announcing and pushed the card to
 * twice the height doing it. The card's own heading already names the sprint.
 */
export function noteCardShowsExcerpt(noteType: string): boolean {
  return (
    noteType !== "SPRINT_PLANNING" &&
    noteType !== "SPRINT_REVIEW" &&
    noteType !== "SPRINT_DOC"
  );
}

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
