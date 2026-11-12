import { decodeClientIssuePayload, clientIssuePreview } from "@/lib/client-issue-payload";
import {
  decodeDeadlineReminderPayload,
  deadlineReminderPreview,
} from "@/lib/deadline-reminder-payload";
import { decodeNoteActivityPayload, noteActivityPreview } from "@/lib/note-activity-payload";
import { decodeNoteCommentPayload } from "@/lib/note-comment-payload";
import { decodeProofBypassPayload, proofBypassPreview } from "@/lib/proof-bypass-payload";
import { decodeTaskCommentPayload } from "@/lib/task-comment-payload";

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const AUDIO_EXT = /\.(m4a|mp3|ogg|wav|aac)$/i;

export type FileSearchKind = "image" | "video" | "audio" | "file";

/** How a search row should draw an attachment. Mime wins; the name is the fallback. */
export function fileSearchKind(mimeType: string | null, filename: string): FileSearchKind {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXT.test(filename)) return "audio";
  return "file";
}

/** Plain text a person would type to find this message. Not the stored markup. */
export function messageSearchText(body: string, filenames: string[] = []): string {
  const spoken = spokenText(body);
  const files = filenames.map((name) => name.trim()).filter(Boolean);
  return [spoken, ...files].join(" ").replace(/\s+/g, " ").trim().slice(0, 20_000);
}

function spokenText(body: string): string {
  const note = decodeNoteCommentPayload(body);
  if (note) return joinParts(note.noteTitle, note.quoteText, note.comment);
  const task = decodeTaskCommentPayload(body);
  if (task) return joinParts(task.taskTitle, task.quoteText, task.comment);
  const activity = decodeNoteActivityPayload(body);
  if (activity) return joinParts(noteActivityPreview(activity), activity.excerpt);
  const issue = decodeClientIssuePayload(body);
  if (issue) return joinParts(clientIssuePreview(issue), issue.excerpt);
  const bypass = decodeProofBypassPayload(body);
  if (bypass) return joinParts(proofBypassPreview(bypass), bypass.taskTitle, bypass.projectName);
  const reminder = decodeDeadlineReminderPayload(body);
  if (reminder) return deadlineReminderPreview(reminder);
  return body.replace(MENTION_RE, "@$1").trim();
}

function joinParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

/** A short window around the first match, with indexes into that window. */
export function messageSearchSnippet(
  text: string,
  query: string,
  radius = 48,
): { snippet: string; matchStart: number; matchEnd: number } {
  const q = query.trim();
  const hay = text.replace(/\s+/g, " ").trim();
  const idx = q ? hay.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (idx < 0) {
    return { snippet: hay.slice(0, radius * 2), matchStart: 0, matchEnd: 0 };
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(hay.length, idx + q.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < hay.length ? "…" : "";
  const snippet = prefix + hay.slice(start, end) + suffix;
  const matchStart = prefix.length + (idx - start);
  return { snippet, matchStart, matchEnd: matchStart + q.length };
}
