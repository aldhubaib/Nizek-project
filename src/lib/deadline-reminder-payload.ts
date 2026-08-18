import { format } from "date-fns";
import { ALL_MENTION_TOKEN } from "@/lib/mentions";
import { projectNoteUrl } from "@/lib/project-note-url";

export const NIZEK_BOT_NAME = "Nizek Bot";
export const NIZEK_BOT_AUTHOR_ID = "nizek-bot";
export const NIZEK_BOT_INITIALS = "NB";

const PAYLOAD_PREFIX = "<!--deadline-reminder:";
const LEGACY_PAYLOAD_PREFIX = "\x00deadline-reminder:";

export type DeadlineReminderPayload = {
  noteId: string;
  projectId: string;
  title: string;
  dueDate: string;
  offsetDays: number;
};

export type DeadlineReminderTheme = {
  accent: string;
  accentMuted: string;
  border: string;
  ring: string;
  pill: string;
  icon: string;
  button: string;
  category: string;
  statusLabel: string;
};

export function deadlineReminderTheme(offsetDays: number): DeadlineReminderTheme {
  if (offsetDays < 0) {
    const days = Math.abs(offsetDays);
    return {
      accent: "text-red-400",
      accentMuted: "text-red-400/80",
      border: "border-red-500/40",
      ring: "ring-red-500/30",
      pill: "border-red-500/30 bg-red-500/10 text-red-400",
      icon: "text-red-400",
      button: "border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400",
      category: "OVERDUE",
      statusLabel: `${days} day${days === 1 ? "" : "s"} overdue`,
    };
  }
  if (offsetDays === 0) {
    return {
      accent: "text-amber-400",
      accentMuted: "text-amber-400/80",
      border: "border-amber-500/40",
      ring: "ring-amber-500/30",
      pill: "border-amber-500/30 bg-amber-500/10 text-amber-400",
      icon: "text-amber-400",
      button: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400",
      category: "DUE TODAY",
      statusLabel: "Due today",
    };
  }
  if (offsetDays <= 10) {
    return {
      accent: "text-yellow-400",
      accentMuted: "text-yellow-400/80",
      border: "border-yellow-500/35",
      ring: "ring-yellow-500/25",
      pill: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
      icon: "text-yellow-400",
      button: "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-400",
      category: "ROADMAP REMINDER",
      statusLabel: `Due in ${offsetDays} days`,
    };
  }
  return {
    accent: "text-sky-400",
    accentMuted: "text-sky-400/80",
    border: "border-sky-500/35",
    ring: "ring-sky-500/25",
    pill: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    icon: "text-sky-400",
    button: "border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 text-sky-400",
    category: "ROADMAP REMINDER",
    statusLabel: `Due in ${offsetDays} days`,
  };
}

export function encodeDeadlineReminderBody(
  payload: DeadlineReminderPayload,
): string {
  return `${ALL_MENTION_TOKEN}\n${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeDeadlineReminderPayload(
  body: string,
): DeadlineReminderPayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  const legacyIdx = body.indexOf(LEGACY_PAYLOAD_PREFIX);
  const start =
    idx !== -1
      ? idx + PAYLOAD_PREFIX.length
      : legacyIdx !== -1
        ? legacyIdx + LEGACY_PAYLOAD_PREFIX.length
        : -1;
  if (start === -1) return null;
  try {
    return JSON.parse(body.slice(start)) as DeadlineReminderPayload;
  } catch {
    return null;
  }
}

export function deadlineReminderNoteUrl(projectId: string, noteId: string): string {
  return projectNoteUrl(projectId, noteId, { noteType: "DEADLINE" });
}

export function deadlineReminderPreview(payload: DeadlineReminderPayload): string {
  const theme = deadlineReminderTheme(payload.offsetDays);
  const due = format(new Date(payload.dueDate), "MMM d, yyyy");
  return `${theme.statusLabel} · ${payload.title} (${due})`;
}

export function isDeadlineReminderMessage(kind: string): boolean {
  return kind === "deadline_reminder";
}
