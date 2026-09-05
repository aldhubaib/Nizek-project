"use client";

import { cn } from "@/lib/utils";
import { isProofOfWorkChatMessage } from "@/components/messages/proof-of-work-card";
import type {
  MessageAttachment,
  MessageTaskRef,
  ReactionSummary,
} from "@/actions/messages";
import type { DeadlineReminderPayload } from "@/lib/deadline-reminder-payload";
import type { NoteCommentPayload } from "@/lib/note-comment-payload";
import type { TaskCommentPayload } from "@/lib/task-comment-payload";
import type { NoteActivityPayload } from "@/lib/note-activity-payload";
import type { ClientIssuePayload } from "@/lib/client-issue-payload";
import type { ProofBypassPayload } from "@/lib/proof-bypass-payload";

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorImageUrl?: string | null;
  body: string;
  createdAt: string;
  updatedAt?: string;
  edited?: boolean;
  attachments: MessageAttachment[];
  reactions: ReactionSummary[];
  replyToId?: string | null;
  kind?: string;
  /** Task this message belongs to — rendered as a reference card in project channels. */
  task?: MessageTaskRef | null;
  /** Display names mentioned in the body, highlighted as @chips. */
  mentions?: string[];
  deadlineReminder?: DeadlineReminderPayload | null;
  noteComment?: NoteCommentPayload | null;
  taskComment?: TaskCommentPayload | null;
  noteActivity?: NoteActivityPayload | null;
  clientIssue?: ClientIssuePayload | null;
  proofBypass?: ProofBypassPayload | null;
  important?: boolean;
};

export type ThreadTarget = {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
};

// A file picked in the composer, held locally until the user presses Send.
export type PendingFile = { key: string; file: File; previewUrl: string | null };

export function isFeedCardKind(kind?: string) {
  return (
    kind === "deadline_reminder" ||
    kind === "note_activity" ||
    kind === "note_comment" ||
    kind === "task_comment" ||
    kind === "proof_bypass" ||
    kind === "rejection"
  );
}

export function isFeedMessage(m: ChatMessage) {
  return isFeedCardKind(m.kind) || isProofOfWorkChatMessage(m);
}

export const fmtTaskNumber = (n: number) => `T-${String(n).padStart(3, "0")}`;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** WhatsApp-style find highlight: white chip on the matching substring. */
export function highlightQuery(
  text: string,
  query: string | undefined,
  keyPrefix: string,
  active: boolean,
): React.ReactNode[] {
  const q = query?.trim();
  if (!q || !text) return [text];
  const re = new RegExp(escapeRegExp(q), "gi");
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) break;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark
        key={`${keyPrefix}-q-${i++}`}
        className={cn(
          "rounded-[2px] px-0.5 font-medium text-black",
          active ? "bg-white" : "bg-white/80",
        )}
      >
        {match[0]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

// Highlights "@Name" runs within a plain-text segment (no URLs) as chips.
function highlightMentions(
  text: string,
  mentions: string[] | undefined,
  mine: boolean,
  keyPrefix: string,
  query?: string,
  searchActive?: boolean,
): React.ReactNode[] {
  const wrap = (t: string, k: string) =>
    highlightQuery(t, query, k, Boolean(searchActive));
  if (!mentions || mentions.length === 0) return wrap(text, keyPrefix);
  const pattern = new RegExp(
    `@(${mentions
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "g",
  );
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(...wrap(text.slice(last, match.index), `${keyPrefix}-t${key}`));
    }
    parts.push(
      <span
        key={`${keyPrefix}-mn-${key++}`}
        className={cn(
          "rounded px-1 font-medium",
          mine
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-primary/15 text-primary",
        )}
      >
        @{wrap(match[1], `${keyPrefix}-mnq${key}`)}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(...wrap(text.slice(last), `${keyPrefix}-t${key}`));
  return parts;
}

// Renders a message body with clickable links and highlighted @mentions.
export function renderMessageBody(
  text: string,
  mentions: string[] | undefined,
  mine: boolean,
  query?: string,
  searchActive?: boolean,
) {
  const parts: React.ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s<]+)/gi;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(
        ...highlightMentions(
          text.slice(last, match.index),
          mentions,
          mine,
          `s${key}`,
          query,
          searchActive,
        ),
      );
    }
    let url = match[1];
    const trailing = url.match(/[)\].,;:!?'"]+$/)?.[0] ?? "";
    if (trailing) url = url.slice(0, url.length - trailing.length);
    parts.push(
      <a
        key={`lnk-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "break-all underline underline-offset-2",
          mine ? "text-primary-foreground" : "text-primary",
        )}
      >
        {highlightQuery(url, query, `lnkq${key}`, Boolean(searchActive))}
      </a>,
    );
    if (trailing) {
      parts.push(
        ...highlightQuery(trailing, query, `tr${key}`, Boolean(searchActive)),
      );
    }
    last = match.index + match[1].length;
  }
  if (last < text.length) {
    parts.push(
      ...highlightMentions(
        text.slice(last),
        mentions,
        mine,
        `s${key}`,
        query,
        searchActive,
      ),
    );
  }
  return <>{parts}</>;
}

// Highlights picked "@Name" mentions in blue inside the composer overlay.
export function renderComposerHighlight(text: string, names: string[]) {
  if (names.length === 0) return text;
  const pattern = new RegExp(
    `@(${names
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "g",
  );
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span key={`cm-${key++}`} className="font-medium text-primary">
        @{match[1]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// Cached MediaQueryList — matchMedia() allocates, and this is read on every
// touchstart in the message list.
let desktopMediaQuery: MediaQueryList | null = null;
export function isDesktopViewport() {
  if (typeof window === "undefined") return false;
  desktopMediaQuery ??= window.matchMedia("(min-width: 1024px)");
  return desktopMediaQuery.matches;
}

export function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
