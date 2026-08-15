"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Paperclip,
  Send,
  X,
  FileText,
  Loader2,
  UploadCloud,
  Search,
  Files as FilesIcon,
  Mic,
  Pause,
  Play,
  MoreVertical,
  Reply,
  Copy,
  Trash2,
  Clock,
  RotateCcw,
  AlertCircle,
  AlertOctagon,
  ArrowUpRight,
  CheckSquare,
  Users,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Pencil,
  Camera,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { shouldCommitSwipeReply } from "@/lib/swipe-reply";
import { ClientChatPeopleManager } from "@/components/messages/client-chat-people";
import {
  toggleReaction,
  deleteMessage as deleteMessageAction,
  editMessage,
  getThreadMessages,
  getProjectTaskRefs,
  markThreadRead,
  toggleImportantMessage,
  listImportantMessages,
  type MessageDTO,
  type MessageAttachment,
  type MessageTaskRef,
  type ReactionSummary,
  type TaskPickerItem,
  type ImportantMessageDTO,
} from "@/actions/messages";
import {
  CreateTaskFromMessageDialog,
  type CreateTaskFromMessagePayload,
} from "@/components/messages/create-task-from-message";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import {
  isThreadMuted,
  setThreadMuted,
} from "@/actions/notification-preferences";
import { useChannel, usePresence, useTyping } from "@/components/realtime/hooks";
import {
  AttachmentBubble,
  isVoiceAttachment,
  Lightbox,
  useLightbox,
  FilesPanel,
} from "@/components/messages/chat-attachments";
import { LinkPreviewCard } from "@/components/messages/link-preview";
import { firstUrl } from "@/lib/link-preview";
import {
  enqueueOutboxMessage,
  retryOutboxEntry,
  discardOutboxEntry,
  useThreadOutbox,
  subscribeDelivered,
  type OutboxEntry,
} from "@/lib/message-outbox";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { DeadlineReminderCard } from "@/components/messages/deadline-reminder-card";
import {
  ChatPostAvatar,
  chatPostAuthorLabel,
} from "@/components/messages/activity-card";
import { NoteCommentCard } from "@/components/messages/note-comment-card";
import { TaskCommentCard } from "@/components/messages/task-comment-card";
import { NoteActivityCard } from "@/components/messages/note-activity-card";
import type { DeadlineReminderPayload } from "@/lib/deadline-reminder-payload";
import type { NoteCommentPayload } from "@/lib/note-comment-payload";
import type { TaskCommentPayload } from "@/lib/task-comment-payload";
import type { NoteActivityPayload } from "@/lib/note-activity-payload";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import { threadPushTag } from "@/lib/notification-read";
import { updateAppBadge } from "@/lib/app-badge";
import {
  ALL_MENTION_ID,
  ALL_MENTION_NAME,
  ALL_MENTION_TEXT_RE,
  ALL_MENTION_TOKEN,
} from "@/lib/mentions";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Number of bars in the live recording waveform.
const VOICE_BAR_COUNT = 40;

// Live recording waveform. Runs its own RAF loop and writes bar heights straight
// to the DOM via refs, so the ~60fps updates never re-render the (huge) chat
// component. Only mounts while recording.
function VoiceVisualizer({
  analyserRef,
  pausedRef,
  paused,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
  pausedRef: React.RefObject<boolean>;
  paused: boolean;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const levelsRef = useRef<number[]>(new Array(VOICE_BAR_COUNT).fill(0));

  useEffect(() => {
    const analyser = analyserRef.current;
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const apply = (v: number, el: HTMLSpanElement | null) => {
      if (!el) return;
      el.style.height = `${Math.max(3, Math.round(v * 26))}px`;
      el.style.opacity = String(pausedRef.current ? 0.35 : 0.5 + v * 0.5);
    };
    const loop = () => {
      if (analyser && data && !pausedRef.current) {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        const level = Math.min(1, peak * 2.5);
        const shifted = levelsRef.current.slice(1);
        shifted.push(level);
        levelsRef.current = shifted;
        for (let i = 0; i < barsRef.current.length; i++) apply(shifted[i], barsRef.current[i]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, pausedRef]);

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center gap-[2px]"
      aria-hidden
    >
      {Array.from({ length: VOICE_BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-[2px] rounded-full bg-muted-foreground/70"
          style={{
            height: "3px",
            opacity: paused ? 0.35 : 0.5,
            transition: "height 90ms linear",
          }}
        />
      ))}
    </div>
  );
}

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
  important?: boolean;
};

function isFeedCardKind(kind?: string) {
  return kind === "deadline_reminder" || kind === "note_activity" || kind === "note_comment";
}

const fmtTaskNumber = (n: number) => `T-${String(n).padStart(3, "0")}`;

// Highlights "@Name" runs within a plain-text segment (no URLs) as chips.
function highlightMentions(
  text: string,
  mentions: string[] | undefined,
  mine: boolean,
  keyPrefix: string,
): React.ReactNode[] {
  if (!mentions || mentions.length === 0) return [text];
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
    if (match.index > last) parts.push(text.slice(last, match.index));
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
        @{match[1]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Renders a message body with clickable links and highlighted @mentions.
function renderMessageBody(
  text: string,
  mentions: string[] | undefined,
  mine: boolean,
) {
  const parts: React.ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s<]+)/gi;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(
        ...highlightMentions(text.slice(last, match.index), mentions, mine, `s${key}`),
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
        {url}
      </a>,
    );
    if (trailing) parts.push(trailing);
    last = match.index + match[1].length;
  }
  if (last < text.length) {
    parts.push(...highlightMentions(text.slice(last), mentions, mine, `s${key}`));
  }
  return <>{parts}</>;
}

// Highlights picked "@Name" mentions in blue inside the composer overlay.
function renderComposerHighlight(text: string, names: string[]) {
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

export type ThreadTarget = {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDay(iso: string) {
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

function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ReactionChips({
  reactions,
  mine,
  currentMemberId,
  memberNames,
  onToggle,
}: {
  reactions: ReactionSummary[];
  mine: boolean;
  currentMemberId: string;
  memberNames: Record<string, string>;
  onToggle: (emoji: string) => void;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
      {reactions.map((r) => {
        const mineReacted = r.memberIds.includes(currentMemberId);
        const ids = [...r.memberIds].sort((a, b) => {
          if (a === currentMemberId) return -1;
          if (b === currentMemberId) return 1;
          return (memberNames[a] ?? "").localeCompare(memberNames[b] ?? "");
        });
        const stop = (e: React.SyntheticEvent) => e.stopPropagation();
        return (
          <Popover key={r.emoji}>
            <PopoverTrigger
              onClick={stop}
              onPointerDown={stop}
              onTouchStart={stop}
              aria-label={
                r.memberIds.length === 1
                  ? `${r.emoji} 1 reaction`
                  : `${r.emoji} ${r.memberIds.length} reactions`
              }
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors",
                mineReacted
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border/60 bg-surface/60 text-muted-foreground hover:bg-surface",
              )}
            >
              <span>{r.emoji}</span>
              <span className="text-[10px] font-medium">{r.memberIds.length}</span>
            </PopoverTrigger>
            <PopoverContent
              align={mine ? "end" : "start"}
              side="top"
              className="w-56 gap-0 p-1.5"
            >
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {r.emoji}{" "}
                {r.memberIds.length === 1
                  ? "1 reaction"
                  : `${r.memberIds.length} reactions`}
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {ids.map((id) => {
                  const fullName = memberNames[id] ?? "Someone";
                  const label = id === currentMemberId ? "You" : fullName;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      <div
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary"
                        aria-hidden
                      >
                        {initialsFrom(
                          id === currentMemberId
                            ? (memberNames[id] ?? "You")
                            : fullName,
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => onToggle(r.emoji)}
                className="mt-0.5 w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                {mineReacted ? "Remove your reaction" : `React with ${r.emoji}`}
              </button>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

// A file picked in the composer, held locally until the user presses Send.
type PendingFile = { key: string; file: File; previewUrl: string | null };

// Sent-but-not-delivered messages (the outbox) live in the app-wide manager in
// lib/message-outbox.ts, NOT in this component — so uploads keep going and the
// message still delivers when the user switches threads or pages mid-upload.

// One chat message. Memoized so unrelated parent re-renders (typing indicator,
// presence, composer keystrokes, recording timer) don't re-render every row —
// a row only re-renders when its own `m`/derived props change. Callbacks are
// stable (useCallback in the parent), so `memo` holds.
function MessageMeta({
  createdAt,
  edited,
  mine,
  blue,
  peerLastReadAt,
  important,
}: {
  createdAt: string;
  edited?: boolean;
  mine: boolean;
  blue: boolean;
  peerLastReadAt?: string | null;
  important?: boolean;
}) {
  const read =
    mine &&
    peerLastReadAt != null &&
    new Date(createdAt).getTime() <= new Date(peerLastReadAt).getTime();
  return (
    <span
      className={cn(
        "ml-1 inline-flex shrink-0 translate-y-0.5 items-center gap-0.5 text-[10px] leading-none",
        blue ? "text-primary-foreground/70" : "text-muted-foreground",
      )}
    >
      {important && (
        <Star
          className="h-3 w-3 fill-amber-400 text-amber-400"
          aria-label="Important"
        />
      )}
      {edited && <span className="italic opacity-80">edited</span>}
      <span>{formatTime(createdAt)}</span>
      {mine &&
        (read ? (
          <CheckCheck className="h-3 w-3" aria-label="Read" />
        ) : (
          <Check className="h-3 w-3" aria-label="Sent" />
        ))}
    </span>
  );
}

const MessageRow = memo(function MessageRow({
  m,
  mine,
  showDay,
  newGroup,
  showAuthor,
  notFirst,
  dimmed,
  replied,
  showTaskCard,
  currentMemberId,
  peerLastReadAt,
  canCreateTask,
  selected,
  onSelect,
  editing,
  editDraft,
  react,
  handleReply,
  handleCopy,
  handleDelete,
  handleEdit,
  handleCreateTask,
  handleToggleImportant,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  scrollToMessage,
  openImage,
  memberNames,
}: {
  m: ChatMessage;
  mine: boolean;
  showDay: boolean;
  newGroup: boolean;
  showAuthor: boolean;
  notFirst: boolean;
  dimmed: boolean;
  replied: ChatMessage | null | undefined;
  showTaskCard: boolean;
  currentMemberId: string;
  peerLastReadAt?: string | null;
  canCreateTask?: boolean;
  /** Mobile selection mode (WhatsApp-style). */
  selected: boolean;
  onSelect: (id: string | null) => void;
  editing: boolean;
  editDraft: string;
  react: (id: string, emoji: string) => void;
  handleReply: (id: string) => void;
  handleCopy: (text: string) => void;
  handleDelete: (id: string) => void;
  handleEdit: (id: string) => void;
  handleCreateTask: (m: ChatMessage) => void;
  handleToggleImportant: (id: string) => void;
  onEditDraftChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  scrollToMessage: (id: string) => void;
  openImage: (att: MessageAttachment) => void;
  memberNames: Record<string, string>;
}) {
  const imageAtts = m.attachments.filter((a) => a.isImage);
  const fileAtts = m.attachments.filter((a) => !a.isImage);
  const [swipeX, setSwipeX] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeXRef = useRef(0);
  const lastDelta = useRef({ dx: 0, dy: 0 });
  const swiped = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const actionHandlers: MessageActionHandlers = {
    onReact: (emoji) => react(m.id, emoji),
    onReply: () => handleReply(m.id),
    onCopy: () => handleCopy(m.body),
    onDelete: () => handleDelete(m.id),
    onEdit: mine && m.kind !== "rejection" ? () => handleEdit(m.id) : undefined,
    onCreateTask: canCreateTask ? () => handleCreateTask(m) : undefined,
    onToggleImportant: () => handleToggleImportant(m.id),
    important: Boolean(m.important),
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // Desktop hover menu handles actions; mobile long-press enters selection.
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    lastDelta.current = { dx: 0, dy: 0 };
    swipeXRef.current = 0;
    swiped.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (!swiped.current) {
        onSelect(m.id);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            /* ignore */
          }
        }
      }
    }, 450);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    lastDelta.current = { dx, dy };
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLongPress();
    // Vertical scroll — drop any in-progress swipe so it can't become a reply.
    if (Math.abs(dy) > Math.abs(dx)) {
      if (swipeXRef.current !== 0) {
        swipeXRef.current = 0;
        setSwipeX(0);
      }
      return;
    }
    if (dx > 0) {
      swiped.current = true;
      const next = Math.min(80, dx);
      swipeXRef.current = next;
      setSwipeX(next);
    }
  };

  const onTouchEnd = () => {
    clearLongPress();
    const { dx, dy } = lastDelta.current;
    swipeXRef.current = 0;
    lastDelta.current = { dx: 0, dy: 0 };
    setSwipeX(0);
    touchStart.current = null;
    if (swiped.current && shouldCommitSwipeReply(dx, dy)) handleReply(m.id);
    swiped.current = false;
  };

  if (m.noteActivity || m.noteComment || m.deadlineReminder) {
    const authorLabel = chatPostAuthorLabel(m.authorId, m.authorName);
    return (
      <div id={`msg-${m.id}`} className={cn("contents", dimmed && "opacity-30")}>
        {showDay && (
          <div className="my-2 flex items-center justify-center">
            <span className="rounded-full bg-surface px-3 py-1 text-tiny font-medium text-muted-foreground">
              {formatDay(m.createdAt)}
            </span>
          </div>
        )}
        <div
          className={cn(
            "flex w-full gap-2 justify-start",
            newGroup && !showDay && notFirst && "mt-3",
          )}
        >
          <ChatPostAvatar
            show={showAuthor}
            authorId={m.authorId}
            authorName={m.authorName}
            authorImageUrl={m.authorImageUrl}
          />
          <div className="flex min-w-0 w-full max-w-[420px] flex-col gap-1">
            {showAuthor && (
              <div className="px-1 text-tiny text-muted-foreground">{authorLabel}</div>
            )}
            {m.deadlineReminder ? (
              <DeadlineReminderCard payload={m.deadlineReminder} createdAt={m.createdAt} />
            ) : m.noteActivity ? (
              <NoteActivityCard payload={m.noteActivity} createdAt={m.createdAt} />
            ) : (
              <NoteCommentCard payload={m.noteComment!} createdAt={m.createdAt} />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (m.taskComment) {
    return (
      <div id={`msg-${m.id}`} className={cn("contents", dimmed && "opacity-30")}>
        {showDay && (
          <div className="my-2 flex items-center justify-center">
            <span className="rounded-full bg-surface px-3 py-1 text-tiny font-medium text-muted-foreground">
              {formatDay(m.createdAt)}
            </span>
          </div>
        )}
        <div
          className={cn(
            "flex gap-2",
            mine ? "justify-end" : "justify-start",
            newGroup && !showDay && notFirst && "mt-3",
          )}
        >
          {!mine && <div className="w-8 shrink-0" aria-hidden />}
          <div className="flex min-w-0 w-full max-w-[420px] flex-col gap-1">
            {showAuthor && (
              <div className="px-1 text-tiny text-muted-foreground">{m.authorName}</div>
            )}
            <TaskCommentCard payload={m.taskComment} createdAt={m.createdAt} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${m.id}`} className={cn("contents", dimmed && "opacity-30")}>
      {showDay && (
        <div className="my-2 flex items-center justify-center">
          <span className="rounded-full bg-surface px-3 py-1 text-tiny font-medium text-muted-foreground">
            {formatDay(m.createdAt)}
          </span>
        </div>
      )}
      <div
        className={cn(
          "relative flex gap-2 touch-pan-y rounded-xl transition-colors",
          mine ? "justify-end" : "justify-start",
          newGroup && !showDay && notFirst && "mt-3",
          // WhatsApp-style selection wash across the row on mobile.
          selected && "bg-primary/15 ring-1 ring-inset ring-primary/25 lg:bg-transparent lg:ring-0",
        )}
        style={swipeX ? { transform: `translateX(${swipeX}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          clearLongPress();
          swipeXRef.current = 0;
          lastDelta.current = { dx: 0, dy: 0 };
          swiped.current = false;
          setSwipeX(0);
          touchStart.current = null;
        }}
      >
        {!mine && (
          <div className="w-8 shrink-0 self-start">
            {showAuthor && (
              m.authorImageUrl ? (
                <Image
                  src={m.authorImageUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div
                  className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xxs font-semibold text-primary"
                  aria-hidden
                >
                  {m.authorName
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
              )
            )}
          </div>
        )}
        <div className={cn("relative flex max-w-[70%] flex-col gap-1.5", mine && "items-end")}>
          {selected && (
            <div
              className={cn(
                "absolute z-20 flex -translate-y-[calc(100%+6px)] items-center gap-0.5 rounded-full border border-border/60 bg-popover px-1.5 py-1 shadow-lg lg:hidden",
                mine ? "right-0" : "left-0",
              )}
            >
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    react(m.id, e);
                    onSelect(null);
                  }}
                  className="grid size-10 place-items-center rounded-full text-xl transition-transform active:scale-125"
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {showAuthor && (
            <div className="px-1 text-tiny text-muted-foreground">{m.authorName}</div>
          )}
          {(m.body || replied || (m.task && showTaskCard) || editing) && (() => {
            const notice = (!!m.task && showTaskCard) || m.kind === "rejection";
            const blue = mine && !notice;
            return (
            <div className="group relative">
              <div
                className={cn(
                  "flex max-w-full flex-col gap-1.5 text-sm leading-relaxed",
                  notice
                    ? "min-w-64 rounded-xl border border-border/60 bg-surface-2/80 p-2.5 text-foreground"
                    : "rounded-2xl px-3.5 py-2",
                  !notice &&
                    (blue
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-surface-2 text-foreground"),
                )}
              >
                {m.task && showTaskCard && (
                  <Link
                    href={`/dashboard/projects/${m.task.projectId}/tasks/${m.task.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2 transition-colors hover:bg-background"
                  >
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Task · #{fmtTaskNumber(m.task.number)}
                      </div>
                      <div className="truncate text-xs font-semibold text-foreground">
                        {m.task.title}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                )}
                {replied && (
                  <button
                    type="button"
                    onClick={() => scrollToMessage(m.replyToId!)}
                    className={cn(
                      "-mx-1 flex flex-col gap-0.5 rounded-md border-l-2 px-2 py-1 text-left text-xs",
                      blue
                        ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/90"
                        : "border-primary/70 bg-primary/10 text-foreground/80",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        blue ? "text-primary-foreground" : "text-primary",
                      )}
                    >
                      {replied.authorId === currentMemberId ? "You" : replied.authorName}
                    </span>
                    <span className="line-clamp-2 opacity-90">
                      {replied.body
                        ? replied.body.length > 120
                          ? `${replied.body.slice(0, 120)}…`
                          : replied.body
                        : "Attachment"}
                    </span>
                  </button>
                )}
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => onEditDraftChange(e.target.value)}
                      className="min-h-[4rem] w-full resize-none rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        className="rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSaveEdit}
                        className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  m.body &&
                  (m.kind === "rejection" ? (
                    (() => {
                      const who = (m.mentions ?? []).find((n) =>
                        m.body.startsWith(`@${n}`),
                      );
                      const reason = who
                        ? m.body.slice(who.length + 1).trim()
                        : m.body;
                      return (
                        <>
                          <div className="flex items-start gap-2 rounded-lg border-l-2 border-destructive bg-destructive/10 px-2.5 py-2 text-xs">
                            <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                                Rejected
                              </div>
                              {reason && (
                                <div className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90">
                                  {reason}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-end gap-2 px-0.5">
                            {who && (
                              <span className="rounded bg-primary/15 px-1 py-0.5 text-xs font-medium text-primary">
                                @{who}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 text-[10px] leading-none text-muted-foreground">
                              {formatTime(m.createdAt)}
                            </span>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <div className={cn("flex items-end gap-2", notice && "px-0.5")}>
                      <span className="whitespace-pre-wrap break-words">
                        {renderMessageBody(m.body, m.mentions, blue)}
                      </span>
                      <MessageMeta
                        createdAt={m.createdAt}
                        edited={m.edited}
                        mine={mine}
                        blue={blue}
                        peerLastReadAt={peerLastReadAt}
                        important={m.important}
                      />
                    </div>
                  ))
                )}
              </div>
              {/* Desktop only — WhatsApp hover ⋮. Mobile uses selection header. */}
              <MessageCaret mine={mine} {...actionHandlers} />
            </div>
            );
          })()}
          {m.kind !== "rejection" && (() => {
            const previewUrl = firstUrl(m.body);
            return previewUrl ? (
              <LinkPreviewCard url={previewUrl} mine={mine} />
            ) : null;
          })()}
          {imageAtts.length > 0 && (
            <div
              className={cn(
                "flex max-w-full flex-wrap gap-1.5",
                mine ? "justify-end" : "justify-start",
              )}
            >
              {imageAtts.map((a) => (
                <AttachmentBubble
                  key={a.id}
                  attachment={a}
                  mine={mine}
                  onOpenImage={openImage}
                  menu={
                    <span className="hidden lg:contents">
                      <ImageActionsMenu {...actionHandlers} />
                    </span>
                  }
                />
              ))}
            </div>
          )}
          {fileAtts.length > 0 && (
            <div className="flex max-w-full flex-col gap-1.5">
              {fileAtts.map((a) => (
                <AttachmentBubble
                  key={a.id}
                  attachment={a}
                  mine={mine}
                  onOpenImage={openImage}
                  timeLabel={
                    // Own attachment-only voice uses MessageMeta (read receipts).
                    isVoiceAttachment(a) && !(!m.body && mine)
                      ? formatTime(m.createdAt)
                      : undefined
                  }
                  menu={
                    <span className="hidden lg:contents">
                      <FileCaretMenu {...actionHandlers} />
                    </span>
                  }
                />
              ))}
            </div>
          )}
          {/* Attachment-only bubbles: time + read receipts for mine. */}
          {!m.body && !editing && (imageAtts.length > 0 || fileAtts.length > 0) && (
            <div className={cn("px-1", mine && "self-end")}>
              <MessageMeta
                createdAt={m.createdAt}
                edited={m.edited}
                mine={mine}
                blue={false}
                peerLastReadAt={peerLastReadAt}
                important={m.important}
              />
            </div>
          )}
          {m.reactions.length > 0 && (
            <ReactionChips
              reactions={m.reactions}
              mine={mine}
              currentMemberId={currentMemberId}
              memberNames={memberNames}
              onToggle={(emoji) => react(m.id, emoji)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export function ThreadChat({
  channel,
  presenceChannel,
  target,
  title,
  subtitle,
  currentMemberId,
  messages: initialMessages,
  hasMoreOlder = false,
  memberNames = {},
  peerMemberIds = [],
  mentionables = [],
  inactive = false,
  readOnly = false,
  canCreateTask = false,
  allowedTaskTypes = [],
  activeContractType = null,
  projectName,
  peerLastReadAt: initialPeerLastReadAt = null,
  isClientRoom = false,
  focusMessageId,
}: {
  channel: string;
  presenceChannel: string | null;
  target: ThreadTarget;
  title: string;
  subtitle: string;
  currentMemberId: string;
  messages: ChatMessage[];
  hasMoreOlder?: boolean;
  memberNames?: Record<string, string>;
  peerMemberIds?: string[];
  /** People involved in this thread, offered by the @ mention autocomplete. */
  mentionables?: { id: string; name: string }[];
  inactive?: boolean;
  readOnly?: boolean;
  canCreateTask?: boolean;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  projectName?: string;
  peerLastReadAt?: string | null;
  /** Isolated client-facing room — shows curated people manager. */
  isClientRoom?: boolean;
  /** Scroll to this message after open (inbox Important tab). */
  focusMessageId?: string;
}) {
  const frameRef = useVisualViewportFrame<HTMLDivElement>();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(hasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipAutoScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const [nearBottom, setNearBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<"chat" | "files" | "important">("chat");
  const [searchOpen, setSearchOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [importantList, setImportantList] = useState<ImportantMessageDTO[]>([]);
  const [importantLoading, setImportantLoading] = useState(false);
  const pendingFocusRef = useRef<string | null>(focusMessageId ?? null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(
    initialPeerLastReadAt,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /** Mobile WhatsApp-style selection — replaces the thread header with actions. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createTaskPayload, setCreateTaskPayload] =
    useState<CreateTaskFromMessagePayload | null>(null);
  const [holdRecording, setHoldRecording] = useState(false);
  const [slideCancelArmed, setSlideCancelArmed] = useState(false);
  const holdStartXRef = useRef<number | null>(null);
  /** Set when pointer-up happens before MediaRecorder is ready. */
  const holdEndedRef = useRef<{ ended: boolean; cancel: boolean }>({
    ended: false,
    cancel: false,
  });
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Thread mute: server-stored, all devices. Muted threads produce no
  // notification row, push, or chime — the thread itself still updates live.
  const threadKey = target.conversationId
    ? `conv-${target.conversationId}`
    : target.taskId
      ? `task-${target.taskId}`
      : target.projectId
        ? `project-${target.projectId}`
        : null;
  // This thread's pending sends, held by the app-wide outbox manager.
  const outbox = useThreadOutbox(threadKey);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (!threadKey) return;
    isThreadMuted(threadKey).then(setMuted).catch(() => {});
  }, [threadKey]);
  const toggleMute = useCallback(() => {
    if (!threadKey) return;
    const next = !muted;
    setMuted(next);
    void setThreadMuted(threadKey, next).catch(() => setMuted(!next));
  }, [threadKey, muted]);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // URL the composer preview was dismissed for (X) — hides it until it changes.
  const [dismissedPreview, setDismissedPreview] = useState<string | null>(null);
  // "#" task references (project channels only).
  const isProjectChannel =
    !!target.projectId && !target.taskId && !target.conversationId;
  const [taskRefs, setTaskRefs] = useState<TaskPickerItem[] | null>(null);
  const [pendingTaskRef, setPendingTaskRef] = useState<TaskPickerItem | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const dragDepth = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const lb = useLightbox();

  const online = usePresence(presenceChannel);
  const { typing, notifyTyping } = useTyping(channel);

  // Adjust state when the server-provided messages change (thread switch / RSC
  // update) during render instead of in an effect — avoids the extra commit +
  // re-render cascade the effect version triggered. Uses the React-sanctioned
  // "store previous prop in state" pattern.
  const [prevInitial, setPrevInitial] = useState(initialMessages);
  if (prevInitial !== initialMessages) {
    setPrevInitial(initialMessages);
    setMessages(initialMessages);
    setHasMore(hasMoreOlder);
  }

  const [prevPeerRead, setPrevPeerRead] = useState(initialPeerLastReadAt);
  if (prevPeerRead !== initialPeerLastReadAt) {
    setPrevPeerRead(initialPeerLastReadAt);
    setPeerLastReadAt(initialPeerLastReadAt);
  }

  // Restore composer draft for this thread from sessionStorage.
  useEffect(() => {
    setReplyTo(null);
    if (!threadKey) return;
    try {
      const saved = sessionStorage.getItem(`nizek-chat-draft:${threadKey}`);
      if (saved) setDraft(saved);
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // Persist draft (debounced).
  useEffect(() => {
    if (!threadKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        const key = `nizek-chat-draft:${threadKey}`;
        if (draft.trim()) sessionStorage.setItem(key, draft);
        else sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [draft, threadKey]);

  // Fetch the previous page (older messages) and prepend it, keeping the
  // viewport anchored so the list doesn't jump.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    const el = scrollerRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const page = await getThreadMessages({
        ...target,
        cursorId: messages[0].id,
      });
      skipAutoScrollRef.current = true;
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !existing.has(m.id));
        return [...older, ...prev];
      });
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        const scroller = scrollerRef.current;
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight - prevHeight + prevTop;
        }
      });
    } catch {
      // Best-effort — the button stays available for a retry.
    } finally {
      setLoadingOlder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingOlder, hasMore, messages, target.taskId, target.projectId, target.conversationId]);

  // Free preview object URLs if the user leaves the thread without sending.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

  // When the outbox manager finishes delivering one of this thread's messages,
  // append the server-confirmed message (no refetch). If the user is on
  // another page at that moment, nothing is subscribed and the message is
  // simply included in the next server render of the thread.
  useEffect(() => {
    if (!threadKey) return;
    return subscribeDelivered(threadKey, (m, replyToId) => {
      setMessages((prev) =>
        prev.some((x) => x.id === m.id)
          ? prev
          : [
              ...prev,
              {
                id: m.id,
                authorId: m.authorId,
                authorName: m.authorName,
                authorImageUrl: m.authorImageUrl ?? null,
                body: m.body,
                createdAt: m.createdAt,
                updatedAt: (m as { updatedAt?: string }).updatedAt,
                edited: (m as { edited?: boolean }).edited,
                attachments: m.attachments,
                reactions: [],
                replyToId,
                kind: m.kind,
                task: m.task ?? null,
                mentions: m.mentions ?? [],
                important: false,
                noteComment: m.noteComment ?? null,
                taskComment: m.taskComment ?? null,
                noteActivity: m.noteActivity ?? null,
              },
            ],
      );
    });
  }, [threadKey]);

  // Reconcile with the server after a gap in realtime coverage — failed
  // history recovery on the channel, or coming back from a long background —
  // by fetching the newest page and appending whatever we don't have. This is
  // what used to require a manual refresh: a DM sent while the phone was
  // locked reconnected to a channel whose replay window had passed, and
  // nothing ever refetched.
  const refreshingRef = useRef(false);
  const refreshLatest = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const page = await getThreadMessages(target);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = page.messages.filter((m) => !seen.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    } catch {
      // Best-effort — the next navigation reconciles.
    } finally {
      refreshingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.taskId, target.projectId, target.conversationId]);

  // Mark this thread's notifications read — but only while someone is actually
  // looking at it. The server component deliberately no longer marks anything
  // (link prefetch was silently marking threads read), so read-state is owned
  // here: on open in a visible tab, whenever the tab becomes visible again,
  // and (debounced) when messages arrive while the user is watching.
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    const tag = threadPushTag(target);
    if (tag) void closePushBannersByTags([tag]);
    void markThreadRead(target)
      .then((counts) => {
        if (counts && typeof counts.unread === "number") {
          updateAppBadge(Math.max(0, counts.unread));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.taskId, target.projectId, target.conversationId]);

  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    markRead();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      markRead();
      // Backgrounded long enough for the WebSocket to have been dropped (or
      // killed by the OS) — catch up on anything published meanwhile.
      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 10_000) {
        void refreshLatest();
      }
      hiddenAtRef.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markRead, refreshLatest]);

  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestMarkRead = useCallback(() => {
    if (markReadTimerRef.current) return;
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      markRead();
    }, 800);
  }, [markRead]);
  useEffect(
    () => () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    },
    [],
  );

  useChannel(channel, (data) => {
    const d = data as
      | {
          type?: string;
          message?: MessageDTO;
          messageId?: string;
          reactions?: ReactionSummary[];
          body?: string;
          updatedAt?: string;
          edited?: boolean;
          memberId?: string;
          lastReadAt?: string;
        }
      | null;
    if (!d) return;
    if (d.type === "message.new" && d.message) {
      const m = d.message;
      // A message arriving while the user is watching this thread counts as
      // read — otherwise it stays unread in the DB until the next page load.
      if (m.authorId !== currentMemberId) {
        requestMarkRead();
        if (!nearBottomRef.current) {
          setNewBelow((n) => n + 1);
        }
      }
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [
          ...prev,
          {
            id: m.id,
            authorId: m.authorId,
            authorName: m.authorName,
            authorImageUrl: m.authorImageUrl ?? null,
            body: m.body,
            createdAt: m.createdAt,
            updatedAt: (m as MessageDTO & { updatedAt?: string }).updatedAt,
            edited: (m as MessageDTO & { edited?: boolean }).edited,
            attachments: m.attachments ?? [],
            reactions: [],
            replyToId: m.replyToId ?? null,
            kind: m.kind,
            task: m.task ?? null,
            mentions: m.mentions ?? [],
            deadlineReminder: m.deadlineReminder ?? null,
            noteComment: m.noteComment ?? null,
            taskComment: m.taskComment ?? null,
            noteActivity: m.noteActivity ?? null,
            important: false,
          },
        ];
      });
    } else if (d.type === "message.updated" && d.messageId) {
      const { messageId, body, updatedAt, edited } = d;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === messageId
            ? {
                ...x,
                body: body ?? x.body,
                updatedAt: updatedAt ?? x.updatedAt,
                edited: edited ?? true,
              }
            : x,
        ),
      );
    } else if (d.type === "thread.read" && d.memberId && d.memberId !== currentMemberId) {
      if (d.lastReadAt) {
        setPeerLastReadAt((prev) => {
          if (!prev) return d.lastReadAt!;
          return new Date(d.lastReadAt!).getTime() > new Date(prev).getTime()
            ? d.lastReadAt!
            : prev;
        });
      }
    } else if (d.type === "reaction.updated" && d.messageId) {
      const { messageId, reactions } = d;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === messageId ? { ...x, reactions: reactions ?? [] } : x,
        ),
      );
    } else if (d.type === "message.deleted" && d.messageId) {
      const { messageId } = d;
      setMessages((prev) => prev.filter((x) => x.id !== messageId));
    }
    // Reconnected but the missed events couldn't be replayed — refetch.
  }, () => void refreshLatest());

  // Track whether the user is near the bottom of the scroller.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = dist < 120;
      nearBottomRef.current = near;
      setNearBottom(near);
      if (near) setNewBelow(0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Prepending older pages must not yank the user to the bottom.
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (!nearBottomRef.current) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing.length, outbox.length]);

  // Infinite load older via top sentinel.
  useEffect(() => {
    const root = scrollerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlder();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loadOlder]);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setNewBelow(0);
    nearBottomRef.current = true;
    setNearBottom(true);
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const peopleNames = useMemo(() => {
    const map: Record<string, string> = { ...memberNames };
    for (const m of messages) {
      if (m.authorId && m.authorName && !map[m.authorId]) {
        map[m.authorId] = m.authorName;
      }
    }
    return map;
  }, [memberNames, messages]);

  // Detect a trailing "#query" token in the draft — opens the task picker.
  const taskToken = useMemo(() => {
    if (!isProjectChannel) return null;
    const m = /(^|\s)#([^\s#]*)$/.exec(draft);
    if (!m) return null;
    return { start: m.index + m[1].length, query: m[2].toLowerCase() };
  }, [draft, isProjectChannel]);

  // Load the project's tasks the first time the member types "#".
  useEffect(() => {
    if (!taskToken || taskRefs || !target.projectId) return;
    getProjectTaskRefs(target.projectId)
      .then(setTaskRefs)
      .catch(() => setTaskRefs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskToken, taskRefs, target.projectId]);

  const pickerResults = useMemo(() => {
    if (!taskToken || !taskRefs) return [];
    const q = taskToken.query;
    const filtered = q
      ? taskRefs.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            fmtTaskNumber(t.number).toLowerCase().includes(q) ||
            String(t.number).includes(q),
        )
      : taskRefs;
    return filtered.slice(0, 6);
  }, [taskToken, taskRefs]);
  const pickerOpen = !!taskToken && pickerResults.length > 0;

  useEffect(() => {
    setPickerIndex(0);
  }, [taskToken?.query, pickerResults.length]);

  const pickTask = (t: TaskPickerItem) => {
    if (!taskToken) return;
    const label = `#${fmtTaskNumber(t.number)}`;
    const before = draft.slice(0, taskToken.start);
    const after = draft.slice(taskToken.start + 1 + taskToken.query.length);
    setDraft(`${before}${label} ${after}`.replace(/ {2,}/g, " "));
    setPendingTaskRef(t);
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  // Detect a trailing "@query" token in the draft — opens the member picker.
  // Mentions display as plain "@Name" while typing; on send each picked name
  // becomes the "@[Name](userId)" token that sendMessage parses to notify them.
  const canMentionAll = !!target.projectId;
  const mentionToken = useMemo(() => {
    if (mentionables.length === 0 && !canMentionAll) return null;
    const m = /(^|\s)@([^\s@]*)$/.exec(draft);
    if (!m) return null;
    return { start: m.index + m[1].length, query: m[2].toLowerCase() };
  }, [draft, mentionables.length, canMentionAll]);

  const mentionResults = useMemo(() => {
    if (!mentionToken) return [];
    const q = mentionToken.query;
    const results: { id: string; name: string; isAll?: boolean }[] = [];
    if (canMentionAll && (!q || ALL_MENTION_NAME.startsWith(q))) {
      results.push({ id: ALL_MENTION_ID, name: ALL_MENTION_NAME, isAll: true });
    }
    const people = q
      ? mentionables.filter((m) => m.name.toLowerCase().includes(q))
      : mentionables;
    for (const m of people) {
      if (results.length >= 6) break;
      results.push(m);
    }
    return results;
  }, [mentionToken, mentionables, canMentionAll]);
  const mentionPickerOpen = !!mentionToken && mentionResults.length > 0;
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionToken?.query, mentionResults.length]);

  const pickMention = (m: { id: string; name: string }) => {
    if (!mentionToken) return;
    const before = draft.slice(0, mentionToken.start);
    const after = draft.slice(mentionToken.start + 1 + mentionToken.query.length);
    const label = m.id === ALL_MENTION_ID ? ALL_MENTION_NAME : m.name;
    setDraft(`${before}@${label} ${after}`.replace(/ {2,}/g, " "));
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  const composerMentionNames = useMemo(() => {
    const names = mentionables.map((m) => m.name);
    if (canMentionAll) names.push(ALL_MENTION_NAME);
    return names;
  }, [mentionables, canMentionAll]);

  // Files wait locally (no upload) until the user presses Send.
  const pickFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files).filter((f) => f.size > 0);
    const tooBig = all.filter((f) => f.size > MAX_UPLOAD_BYTES);
    setFileError(
      tooBig.length > 0
        ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the ${MAX_UPLOAD_LABEL} limit and won't be attached.`
        : null,
    );
    const picked: PendingFile[] = all
      .filter((f) => f.size <= MAX_UPLOAD_BYTES)
      .map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      }));
    setPending((prev) => [...prev, ...picked]);
  };

  const removePending = (key: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    pickFiles(e.dataTransfer.files);
  };

  const send = () => {
    let text = draft.trim();
    if (!text && pending.length === 0) return;
    if (!threadKey) return;
    // Convert @all first, then any "@Full Name" that matches a project member.
    text = text.replace(ALL_MENTION_TEXT_RE, ALL_MENTION_TOKEN);
    const sortedMentions = [...mentionables].sort(
      (a, b) => b.name.length - a.name.length,
    );
    for (const m of sortedMentions) {
      text = text.split(`@${m.name}`).join(`@[${m.name}](${m.id})`);
    }
    const files = [...pending];
    const replyId = replyTo;
    const taskRefId = pendingTaskRef?.id ?? null;
    setDraft("");
    setPending([]);
    setReplyTo(null);
    setPendingTaskRef(null);
    setDismissedPreview(null);
    try {
      sessionStorage.removeItem(`nizek-chat-draft:${threadKey}`);
    } catch {
      /* ignore */
    }

    // The app-wide outbox uploads and delivers this even if the user leaves
    // the thread; this component only renders the entry's progress bubble.
    enqueueOutboxMessage({
      threadKey,
      target,
      body: text,
      replyToId: replyId,
      taskRefId,
      files: files.map((f) => ({
        key: f.key,
        file: f.file,
        previewUrl: f.previewUrl,
      })),
    });
  };

  // --- Voice messages ---
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const recordAccumulatedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordPausedRef = useRef(false);

  // Send a finished recording through the normal attachment pipeline.
  const sendVoice = useCallback(
    (file: File) => {
      if (!threadKey) return;
      const replyId = replyTo;
      setReplyTo(null);
      enqueueOutboxMessage({
        threadKey,
        target,
        body: "",
        replyToId: replyId,
        files: [{ key: `voice-${Date.now()}`, file, previewUrl: null }],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replyTo, threadKey, target.taskId, target.projectId, target.conversationId],
  );

  const cleanupRecordingResources = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const startRecording = async () => {
    if (recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordError("Voice recording is not supported in this browser.");
      setTimeout(() => setRecordError(null), 4000);
      return;
    }
    holdEndedRef.current = { ended: false, cancel: false };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pointer already released while waiting for mic permission.
      if (holdEndedRef.current.ended) {
        stream.getTracks().forEach((t) => t.stop());
        setHoldRecording(false);
        return;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recordChunksRef.current = [];
      discardRecordingRef.current = false;
      recordAccumulatedRef.current = 0;
      recordPausedRef.current = false;
      setRecordPaused(false);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        cleanupRecordingResources();
        if (!discardRecordingRef.current && recordChunksRef.current.length > 0) {
          const type = rec.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const stamp = new Date();
          const name = `Voice message ${stamp.toLocaleDateString()} ${stamp
            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            .replace(/:/g, ".")}.${ext}`;
          const file = new File([new Blob(recordChunksRef.current, { type })], name, { type });
          sendVoice(file);
        }
        recordChunksRef.current = [];
      };
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {}
      recorderRef.current = rec;
      rec.start(250);
      recordStartedAtRef.current = Date.now();
      setRecordSecs(0);
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        const running = recordStartedAtRef.current
          ? Date.now() - recordStartedAtRef.current
          : 0;
        setRecordSecs(Math.floor((recordAccumulatedRef.current + running) / 1000));
      }, 250);
      if (holdEndedRef.current.ended) {
        stopRecording(!holdEndedRef.current.cancel);
      }
    } catch {
      setHoldRecording(false);
      setRecordError("Microphone access was denied. Allow it in your browser settings to send voice messages.");
      setTimeout(() => setRecordError(null), 5000);
    }
  };

  const togglePauseRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      recordAccumulatedRef.current += Date.now() - recordStartedAtRef.current;
      recordStartedAtRef.current = 0;
      recordPausedRef.current = true;
      setRecordPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      recordStartedAtRef.current = Date.now();
      recordPausedRef.current = false;
      setRecordPaused(false);
    }
  };

  const stopRecording = (sendIt: boolean) => {
    discardRecordingRef.current = !sendIt;
    try {
      if (recorderRef.current?.state === "paused") recorderRef.current.resume();
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    setRecording(false);
    setRecordPaused(false);
    recordPausedRef.current = false;
  };

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
      try {
        recorderRef.current?.stop();
      } catch {}
    };
  }, []);

  const react = useCallback(
    (messageId: string, emoji: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          let reactions: ReactionSummary[];
          if (existing) {
            const mine = existing.memberIds.includes(currentMemberId);
            const memberIds = mine
              ? existing.memberIds.filter((id) => id !== currentMemberId)
              : [...existing.memberIds, currentMemberId];
            reactions = memberIds.length
              ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, memberIds } : r))
              : m.reactions.filter((r) => r.emoji !== emoji);
          } else {
            reactions = [...m.reactions, { emoji, memberIds: [currentMemberId] }];
          }
          return { ...m, reactions };
        }),
      );
      startTransition(async () => {
        await toggleReaction(messageId, emoji);
      });
    },
    [currentMemberId],
  );

  const clearSelection = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const handleReply = useCallback((id: string) => {
    setSelectedId(null);
    setReplyTo(id);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setSelectedId(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSelectedId(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMessageAction(id);
    });
  }, []);

  const handleEdit = useCallback(
    (id: string) => {
      const msg = messages.find((m) => m.id === id);
      if (!msg) return;
      setSelectedId(null);
      setEditingId(id);
      setEditDraft(msg.body);
    },
    [messages],
  );

  const onSaveEdit = useCallback(() => {
    if (!editingId) return;
    const id = editingId;
    const body = editDraft.trim();
    if (!body) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, body, edited: true, updatedAt: new Date().toISOString() }
          : m,
      ),
    );
    setEditingId(null);
    setEditDraft("");
    startTransition(async () => {
      const res = await editMessage(id, body);
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  body: res.data.body,
                  updatedAt: res.data.updatedAt,
                  edited: true,
                }
              : m,
          ),
        );
      }
    });
  }, [editingId, editDraft]);

  const onCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const handleCreateTask = useCallback(
    (m: ChatMessage) => {
      if (!canCreateTask || !target.projectId || inactive) return;
      const selection = window.getSelection()?.toString()?.trim() ?? "";
      const msgEl = document.getElementById(`msg-${m.id}`);
      const selectionInMessage =
        selection &&
        msgEl &&
        window.getSelection()?.anchorNode &&
        msgEl.contains(window.getSelection()!.anchorNode);
      const titleSource = selectionInMessage
        ? selection
        : (m.body.split("\n").find((l) => l.trim()) ?? m.body).trim();
      const title =
        titleSource.length > 120
          ? `${titleSource.slice(0, 120)}…`
          : titleSource || "New task";
      const threadPath = target.taskId
        ? `/dashboard/projects/${target.projectId}/tasks/${target.taskId}`
        : `/dashboard/messages/project-${target.projectId}`;
      setSelectedId(null);
      setCreateTaskPayload({
        projectId: target.projectId,
        projectName: projectName ?? title,
        allowedTaskTypes,
        activeContractType: activeContractType ?? "",
        title,
        description: m.body,
        sourceAuthor: m.authorName,
        threadPath,
      });
    },
    [
      canCreateTask,
      target.projectId,
      target.taskId,
      inactive,
      projectName,
      allowedTaskTypes,
      activeContractType,
      title,
    ],
  );

  const handleToggleImportant = useCallback((id: string) => {
    setSelectedId(null);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, important: !m.important } : m)),
    );
    startTransition(async () => {
      const res = await toggleImportantMessage(id);
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, important: !m.important } : m,
          ),
        );
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, important: res.important } : m,
        ),
      );
      try {
        const rows = await listImportantMessages({
          taskId: target.taskId,
          projectId: target.projectId,
          conversationId: target.conversationId,
        });
        setImportantList(rows);
      } catch {
        // Overlay refetches the next time it opens.
      }
    });
  }, [target.taskId, target.projectId, target.conversationId]);

  const selectedMessage = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [selectedId, messages],
  );
  const selectedMine =
    selectedMessage != null && selectedMessage.authorId === currentMemberId;

  const peersOnline = peerMemberIds.some((id) => online.has(id));
  const typingLabel = useMemo(() => {
    const names = typing.map((id) => memberNames[id] ?? "Someone");
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return "Several people are typing…";
  }, [typing, memberNames]);

  const sq = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!sq) return null;
    return messages.filter((m) => m.body.toLowerCase().includes(sq));
  }, [messages, sq]);

  const matchIds = useMemo(() => {
    if (!searchMatches) return null;
    return new Set(searchMatches.map((m) => m.id));
  }, [searchMatches]);

  const scrollToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/60", "rounded-2xl");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-2xl"), 1500);
  }, []);

  const jumpToMessage = useCallback(
    (id: string) => {
      setView("chat");
      setSearchOpen(false);
      pendingFocusRef.current = id;
      if (document.getElementById(`msg-${id}`)) {
        scrollToMessage(id);
        pendingFocusRef.current = null;
      }
    },
    [scrollToMessage],
  );

  useEffect(() => {
    if (focusMessageId) pendingFocusRef.current = focusMessageId;
  }, [focusMessageId]);

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    if (document.getElementById(`msg-${id}`)) {
      scrollToMessage(id);
      pendingFocusRef.current = null;
      return;
    }
    if (hasMore && !loadingOlder) {
      void loadOlder();
      return;
    }
    if (!loadingOlder && !hasMore) pendingFocusRef.current = null;
  }, [messages, hasMore, loadingOlder, loadOlder, scrollToMessage]);

  useEffect(() => {
    if (view !== "important") return;
    let cancelled = false;
    setImportantLoading(true);
    listImportantMessages({
      taskId: target.taskId,
      projectId: target.projectId,
      conversationId: target.conversationId,
    })
      .then((rows) => {
        if (!cancelled) setImportantList(rows);
      })
      .catch(() => {
        if (!cancelled) setImportantList([]);
      })
      .finally(() => {
        if (!cancelled) setImportantLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, target.taskId, target.projectId, target.conversationId]);

  const allImages = useMemo(
    () => messages.flatMap((m) => m.attachments.filter((a) => a.isImage)),
    [messages],
  );

  const msgByAttachmentId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) for (const a of m.attachments) map.set(a.id, m);
    return map;
  }, [messages]);

  const openImage = useCallback(
    (att: MessageAttachment) => lb.open(att, allImages),
    [lb, allImages],
  );

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const replyingTo = replyTo ? byId.get(replyTo) : null;

  // Hold-to-record: track pointer on window so the composer UI can swap to the
  // recording bar without losing pointerup / slide-to-cancel.
  const onMicPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    holdStartXRef.current = e.clientX;
    setSlideCancelArmed(false);
    setHoldRecording(true);
    let cancelled = false;
    const onMove = (ev: PointerEvent) => {
      if (holdStartXRef.current == null) return;
      const dx = ev.clientX - holdStartXRef.current;
      cancelled = dx < -80;
      setSlideCancelArmed(cancelled);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setHoldRecording(false);
      setSlideCancelArmed(false);
      holdStartXRef.current = null;
      if (recorderRef.current) {
        stopRecording(!cancelled);
      } else {
        // Mic permission / recorder still starting — finish when ready.
        holdEndedRef.current = { ended: true, cancel: cancelled };
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    void startRecording();
  };

  // First link in the draft — previewed above the composer until dismissed.
  const composerUrl = useMemo(() => {
    const u = firstUrl(draft);
    return u && u !== dismissedPreview ? u : null;
  }, [draft, dismissedPreview]);

  return (
    <div
      ref={frameRef}
      className="relative flex min-h-0 flex-1 flex-col touch-manipulation"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-surface/80 px-10 py-8 text-primary">
            <UploadCloud className="h-8 w-8" />
            <span className="text-sm font-semibold">Drop files to upload</span>
          </div>
        </div>
      )}

      {/* Thread header — swaps to WhatsApp-style selection toolbar on mobile. */}
      {selectedMessage ? (
        <div className="flex h-14 items-center gap-0.5 border-b border-border/60 bg-surface/80 px-1 sm:px-2 lg:hidden">
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Cancel selection"
            className="grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[1.5rem] px-1 text-base font-semibold tabular-nums">
            1
          </span>
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => handleReply(selectedMessage.id)}
              aria-label="Reply"
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Reply className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => handleCopy(selectedMessage.body)}
              aria-label="Copy"
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Copy className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => handleToggleImportant(selectedMessage.id)}
              aria-label={
                selectedMessage.important
                  ? "Remove from important"
                  : "Mark as important"
              }
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  selectedMessage.important && "fill-amber-400 text-amber-400",
                )}
              />
            </button>
            {canCreateTask && target.projectId && !inactive && (
              <button
                type="button"
                onClick={() => handleCreateTask(selectedMessage)}
                aria-label="Create task"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <CheckSquare className="h-5 w-5" />
              </button>
            )}
            {selectedMine && selectedMessage.kind !== "rejection" && (
              <button
                type="button"
                onClick={() => handleEdit(selectedMessage.id)}
                aria-label="Edit"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {selectedMine && (
              <button
                type="button"
                onClick={() => handleDelete(selectedMessage.id)}
                aria-label="Delete"
                className="grid size-11 place-items-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <MoreVertical className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                <DropdownMenuItem
                  onClick={() => {
                    clearSelection();
                    setView("chat");
                    setSearchOpen(true);
                  }}
                  className="min-h-11 gap-3 text-sm"
                >
                  <Search className="h-4 w-4" />
                  <span className="flex-1">Search in chat</span>
                </DropdownMenuItem>
                {canCreateTask && target.projectId && !inactive && (
                  <DropdownMenuItem
                    onClick={() => handleCreateTask(selectedMessage)}
                    className="min-h-11 gap-3 text-sm"
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span className="flex-1">Create task</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-border/60 px-3 sm:gap-3 sm:px-4",
          selectedMessage && "hidden lg:flex",
        )}
      >
        <Link
          href="/dashboard/messages"
          aria-label="Back to inbox"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden lg:size-8"
        >
          <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            {muted && (
              <BellOff className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Muted" />
            )}
            {peerMemberIds.length > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xxs",
                  peersOnline ? "text-emerald-500" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    peersOnline ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                />
                {peersOnline ? "Online" : "Offline"}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More options"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-8"
          >
            <MoreVertical className="h-5 w-5 lg:h-4 lg:w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => { setView("chat"); setSearchOpen(true); }}>
              <Search className="h-4 w-4" />
              <span className="flex-1">Search</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView(view === "files" ? "chat" : "files")}>
              <FilesIcon className="h-4 w-4" />
              <span className="flex-1">Files</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSearchOpen(false);
                setPeopleOpen(false);
                setView(view === "important" ? "chat" : "important");
              }}
            >
              <Star className="h-4 w-4" />
              <span className="flex-1">Important</span>
            </DropdownMenuItem>
            {isClientRoom && target.projectId && (
              <DropdownMenuItem
                onClick={() => {
                  setPeopleOpen(true);
                  setSearchOpen(false);
                }}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1">People</span>
              </DropdownMenuItem>
            )}
            {threadKey && (
              <DropdownMenuItem onClick={toggleMute}>
                {muted ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                <span className="flex-1">{muted ? "Unmute" : "Mute"}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollerRef} className="h-full overflow-y-auto px-4 py-4 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-1.5">
            <div ref={topSentinelRef} className="h-px w-full" aria-hidden />
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-60"
                >
                  {loadingOlder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const isFeed = isFeedCardKind(m.kind);
              const prevFeed = isFeedCardKind(prev?.kind);
              const newGroup =
                !prev ||
                prev.authorId !== m.authorId ||
                showDay ||
                isFeed ||
                prevFeed;
              const mine = isFeed ? false : m.authorId === currentMemberId;
              return (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={mine}
                  showDay={showDay}
                  newGroup={newGroup}
                  showAuthor={!mine && newGroup}
                  notFirst={i > 0}
                  dimmed={Boolean(sq && matchIds && !matchIds.has(m.id))}
                  replied={m.replyToId ? byId.get(m.replyToId) : null}
                  showTaskCard={!target.taskId}
                  currentMemberId={currentMemberId}
                  peerLastReadAt={peerLastReadAt}
                  canCreateTask={
                    canCreateTask && !!target.projectId && !inactive
                  }
                  selected={selectedId === m.id}
                  onSelect={setSelectedId}
                  editing={editingId === m.id}
                  editDraft={editingId === m.id ? editDraft : ""}
                  react={react}
                  handleReply={handleReply}
                  handleCopy={handleCopy}
                  handleDelete={handleDelete}
                  handleEdit={handleEdit}
                  handleCreateTask={handleCreateTask}
                  handleToggleImportant={handleToggleImportant}
                  onEditDraftChange={setEditDraft}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  scrollToMessage={scrollToMessage}
                  openImage={openImage}
                  memberNames={peopleNames}
                />
              );
            })}
            {outbox.map((o) => (
              <OutboxBubble
                key={o.tempId}
                entry={o}
                onRetry={() => retryOutboxEntry(o.tempId)}
                onDiscard={() => discardOutboxEntry(o.tempId)}
              />
            ))}
            {messages.length === 0 && outbox.length === 0 && (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <div className="text-sm font-medium text-foreground">
                  No messages yet
                </div>
                <p className="text-xs text-muted-foreground">
                  Send a message to start the conversation.
                </p>
              </div>
            )}
            {typingLabel && (
              <div className="flex items-end gap-2">
                <div className="w-8 shrink-0" />
                <div className="flex flex-col gap-1">
                  <div className="rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5">
                    <div className="flex items-center gap-1" aria-label={typingLabel}>
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary [animation-delay:-0.32s]" />
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary [animation-delay:-0.16s]" />
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
                    </div>
                  </div>
                  <span className="px-1 text-tiny text-muted-foreground">{typingLabel}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        {newBelow > 0 && !nearBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
          >
            ↓ New messages{newBelow > 1 ? ` (${newBelow})` : ""}
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/60 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-8">
        <div className="mx-auto w-full max-w-[1100px]">
          {inactive || readOnly ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-surface/30 px-4 py-3 text-xs text-muted-foreground">
              {inactive
                ? "This project is not active. The channel is read-only."
                : "You have read-only access to this chat."}
            </div>
          ) : (
          <>
          {pendingTaskRef && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs">
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">Referencing task </span>
                <span className="font-medium">
                  #{fmtTaskNumber(pendingTaskRef.number)} · {pendingTaskRef.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingTaskRef(null)}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Remove task reference"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {mentionPickerOpen && (
            <div className="relative">
              <div className="absolute -top-1 left-0 z-10 w-full -translate-y-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
                <div className="border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  People in {title}
                </div>
                <ul className="max-h-60 overflow-y-auto py-1">
                  {mentionResults.map((m, i) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(m);
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                          i === mentionIndex ? "bg-surface" : "hover:bg-surface/60",
                        )}
                      >
                        {m.isAll ? (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                            {m.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {m.isAll ? "@all" : m.name}
                        </span>
                        {m.isAll && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            Everyone
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {pickerOpen && (
            <div className="relative">
              <div className="absolute -top-1 left-0 z-10 w-full -translate-y-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
                <div className="border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks in {title}
                </div>
                <ul className="max-h-60 overflow-y-auto py-1">
                  {pickerResults.map((task, i) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickTask(task);
                        }}
                        onMouseEnter={() => setPickerIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                          i === pickerIndex ? "bg-surface" : "hover:bg-surface/60",
                        )}
                      >
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">
                          #{fmtTaskNumber(task.number)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        {task.statusName && (
                          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: task.statusColor ?? "var(--muted-foreground)" }}
                            />
                            {task.statusName}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {replyingTo && (
            <div className="mb-2 flex items-start gap-2 rounded-t-2xl border border-b-0 border-border/60 bg-surface/60 px-3 py-2">
              <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-primary">
                  Replying to {replyingTo.authorId === currentMemberId ? "yourself" : replyingTo.authorName}
                </div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {replyingTo.body || "Attachment"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Cancel reply"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1.5 text-xs"
                >
                  {p.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="max-w-40 truncate">{p.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePending(p.key)}
                    aria-label="Remove"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {composerUrl && !recording && (
            <LinkPreviewCard
              url={composerUrl}
              variant="composer"
              onDismiss={() => setDismissedPreview(composerUrl)}
            />
          )}
          {recordError && (
            <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {recordError}
            </div>
          )}
          {fileError && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span>{fileError}</span>
              <button
                type="button"
                className="shrink-0 opacity-70 hover:opacity-100"
                onClick={() => setFileError(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {recording ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface/40 p-2 sm:gap-3">
              {holdRecording ? (
                <>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-destructive",
                        !slideCancelArmed && "animate-pulse",
                      )}
                      aria-hidden
                    />
                    <span className="font-medium tabular-nums">
                      {Math.floor(recordSecs / 60)}:
                      {String(recordSecs % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <VoiceVisualizer
                    analyserRef={analyserRef}
                    pausedRef={recordPausedRef}
                    paused={false}
                  />
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      slideCancelArmed
                        ? "font-medium text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {slideCancelArmed ? "Release to cancel" : "Slide left to cancel"}
                  </span>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Discard recording"
                    onClick={() => stopRecording(false)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-destructive",
                        !recordPaused && "animate-pulse",
                      )}
                      aria-hidden
                    />
                    <span className="font-medium tabular-nums">
                      {Math.floor(recordSecs / 60)}:
                      {String(recordSecs % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <VoiceVisualizer
                    analyserRef={analyserRef}
                    pausedRef={recordPausedRef}
                    paused={recordPaused}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full text-destructive hover:text-destructive"
                    onClick={togglePauseRecording}
                    aria-label={recordPaused ? "Resume recording" : "Pause recording"}
                  >
                    {recordPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    className="shrink-0 rounded-full bg-success text-background hover:bg-success/90"
                    onClick={() => stopRecording(true)}
                    aria-label="Send voice message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ) : (
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-surface/40 p-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            <input
              ref={photosInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            {/* Mobile: attach sheet; desktop: direct files. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Attach"
                className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
              >
                <Paperclip className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  <span className="flex-1">Camera</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => photosInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="flex-1">Photos</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileText className="h-4 w-4" />
                  <span className="flex-1">Files</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-full lg:inline-flex"
              aria-label="Attach"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              <div
                aria-hidden
                ref={mirrorRef}
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-2 text-[16px] leading-5 text-foreground md:text-sm md:leading-normal"
              >
                {renderComposerHighlight(draft, composerMentionNames)}
                {"\u200b"}
              </div>
            <Textarea
              ref={composerRef}
              value={draft}
              enterKeyHint="send"
              inputMode="text"
              autoCapitalize="sentences"
              onScroll={(e) => {
                const m = mirrorRef.current;
                if (m) {
                  m.scrollTop = e.currentTarget.scrollTop;
                  m.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                notifyTyping();
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const files: File[] = [];
                for (const item of Array.from(items)) {
                  if (item.kind !== "file") continue;
                  const file = item.getAsFile();
                  if (!file) continue;
                  if (file.type.startsWith("image/") && (!file.name || file.name === "image.png")) {
                    const ext = file.type.split("/")[1]?.split("+")[0] || "png";
                    const stamp = new Date()
                      .toISOString()
                      .replace(/[:T]/g, "-")
                      .slice(0, 19);
                    files.push(new File([file], `Pasted image ${stamp}.${ext}`, { type: file.type }));
                  } else {
                    files.push(file);
                  }
                }
                if (files.length > 0) {
                  e.preventDefault();
                  pickFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (mentionPickerOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionResults.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (i) =>
                        (i - 1 + mentionResults.length) % mentionResults.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pickMention(mentionResults[mentionIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft((d) => d.replace(/(^|\s)@[^\s@]*$/, "$1"));
                    return;
                  }
                }
                if (pickerOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPickerIndex((i) => (i + 1) % pickerResults.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPickerIndex(
                      (i) => (i - 1 + pickerResults.length) % pickerResults.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pickTask(pickerResults[pickerIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft((d) => d.replace(/(^|\s)#[^\s#]*$/, "$1"));
                    return;
                  }
                }
                // Return / iOS keyboard Send sends. Shift+Enter stays a newline.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape" && replyTo) {
                  e.preventDefault();
                  setReplyTo(null);
                }
              }}
              placeholder={
                replyingTo
                  ? "Reply…"
                  : isProjectChannel
                    ? `Message ${title} — type # to link a task`
                    : `Message ${title}`
              }
              onBlur={() => {
                if (window.scrollY !== 0 || window.scrollX !== 0) {
                  window.scrollTo(0, 0);
                }
              }}
              className="relative max-h-32 min-h-10 w-full resize-none overflow-y-auto border-0 !bg-transparent p-2 text-[16px] leading-5 !text-transparent caret-foreground shadow-none [field-sizing:fixed] focus-visible:ring-0 dark:!bg-transparent md:text-sm md:leading-normal"
              rows={1}
            />
            </div>
            {draft.trim() || pending.length > 0 ? (
              <Button
                size="icon"
                className="size-11 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 lg:size-9"
                onPointerDown={(e) => {
                  // Keep the textarea focused so the keyboard stays open
                  // between sends (iOS otherwise collapses it on this tap).
                  e.preventDefault();
                }}
                onClick={send}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full touch-none select-none"
                onPointerDown={onMicPointerDown}
                aria-label="Hold to record voice message"
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
          )}
          </>
          )}
        </div>
      </div>

      {lb.state && (
        <Lightbox
          images={lb.state.images}
          index={lb.state.index}
          onClose={lb.close}
          onIndex={lb.setIndex}
          renderMenu={(att) => {
            const msg = msgByAttachmentId.get(att.id);
            if (!msg) return null;
            const mine = msg.authorId === currentMemberId;
            return (
              <ImageActionsMenu
                onReact={(emoji) => react(msg.id, emoji)}
                onReply={() => {
                  lb.close();
                  handleReply(msg.id);
                }}
                onCopy={() => handleCopy(msg.body)}
                onEdit={
                  mine
                    ? () => {
                        lb.close();
                        handleEdit(msg.id);
                      }
                    : undefined
                }
                onCreateTask={
                  canCreateTask && target.projectId && !inactive
                    ? () => {
                        lb.close();
                        handleCreateTask(msg);
                      }
                    : undefined
                }
                onToggleImportant={() => {
                  lb.close();
                  handleToggleImportant(msg.id);
                }}
                important={Boolean(msg.important)}
                onDelete={() => {
                  lb.close();
                  handleDelete(msg.id);
                }}
              />
            );
          }}
        />
      )}
      {searchOpen && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border/60 bg-background shadow-xl max-lg:inset-0 max-lg:w-full lg:inset-y-0 lg:right-0 lg:w-80">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">Search messages</span>
          </div>
          <div className="shrink-0 border-b border-border/60 px-3 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }}
                placeholder="Search"
                className="h-10 rounded-full pl-9 pr-9 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!sq && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                Search for messages in this conversation.
              </div>
            )}
            {sq && searchMatches && searchMatches.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No messages found.
              </div>
            )}
            {sq && searchMatches && searchMatches.length > 0 && (
              <>
                <div className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">
                  {searchMatches.length} result{searchMatches.length === 1 ? "" : "s"}
                </div>
                <ul className="flex flex-col">
                  {searchMatches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => scrollToMessage(m.id)}
                        className="flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left hover:bg-surface/60"
                      >
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(m.createdAt).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        <span className="line-clamp-2 text-sm text-foreground">
                          <span className="text-muted-foreground">{m.authorName}:</span>{" "}
                          {m.body}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      {view === "files" && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col bg-background shadow-xl max-lg:inset-0 max-lg:w-full lg:inset-y-0 lg:right-0 lg:w-80">
          <FilesPanel
            messages={messages.filter((m) => m.attachments.length > 0)}
            onClose={() => setView("chat")}
          />
        </div>
      )}
      {view === "important" && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border/60 bg-background shadow-xl max-lg:inset-0 max-lg:w-full lg:inset-y-0 lg:right-0 lg:w-80">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setView("chat")}
              aria-label="Close important"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">Important</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {importantLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!importantLoading && importantList.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No important messages in this chat. Star a message from its menu to find it here.
              </div>
            )}
            {!importantLoading && importantList.length > 0 && (
              <ul className="flex flex-col">
                {importantList.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => jumpToMessage(m.id)}
                      className="flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left hover:bg-surface/60"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {new Date(m.createdAt).toLocaleDateString([], {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                      <span className="line-clamp-2 text-sm text-foreground">
                        <span className="text-muted-foreground">{m.authorName}:</span>{" "}
                        {m.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {peopleOpen && isClientRoom && target.projectId && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border/60 bg-background shadow-xl max-lg:inset-0 max-lg:w-full lg:inset-y-0 lg:right-0 lg:w-80">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setPeopleOpen(false)}
              aria-label="Close people"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">People</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <ClientChatPeopleManager
              projectId={target.projectId}
              enabled
              compact
            />
          </div>
        </div>
      )}

      <CreateTaskFromMessageDialog
        open={!!createTaskPayload}
        onClose={() => setCreateTaskPayload(null)}
        payload={createTaskPayload}
        onCreated={(task) => {
          if (!threadKey || !target.projectId) return;
          // Project channel: optionally post a task reference via outbox.
          if (isProjectChannel) {
            enqueueOutboxMessage({
              threadKey,
              target,
              body: `Created task #${fmtTaskNumber(task.taskNumber)} · ${task.title}`,
              taskRefId: task.id,
              files: [],
            });
          } else {
            setPendingTaskRef({
              id: task.id,
              number: task.taskNumber,
              title: task.title,
              statusName: null,
              statusColor: null,
            });
          }
          setCreateTaskPayload(null);
        }}
      />
    </div>
  );
}

// An optimistically-sent message still uploading/delivering, rendered as a
// "mine" bubble with per-file progress — the WhatsApp send experience.
function OutboxBubble({
  entry,
  onRetry,
  onDiscard,
}: {
  entry: OutboxEntry;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const failed = entry.status === "error";

  return (
    <div className="flex justify-end gap-2">
      <div className="flex max-w-[70%] flex-col items-end gap-1">
        {entry.files.length > 0 && (
          <div className="flex max-w-full flex-col gap-1.5">
            {entry.files.map((f) => {
              const pct = f.status === "done" ? 100 : f.progress;
              const isImage = Boolean(
                f.contentType?.startsWith("image/") && f.previewUrl,
              );
              if (isImage) {
                return (
                  <div
                    key={f.key}
                    className="relative overflow-hidden rounded-xl border border-border/50 bg-surface"
                    style={{ maxWidth: 240 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.previewUrl!}
                      alt={f.name}
                      className="max-h-60 w-auto max-w-[240px] object-cover"
                    />
                    {!failed && entry.status === "uploading" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                        <span className="text-xs font-semibold text-white">
                          {pct}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={f.key}
                  className="flex items-center gap-2.5 rounded-xl border border-primary-foreground/20 bg-primary/80 px-3 py-2 text-sm text-primary-foreground"
                >
                  {entry.status === "uploading" && !failed ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 opacity-80" />
                  )}
                  <span className="max-w-[200px] truncate font-medium">
                    {f.name}
                  </span>
                  {entry.status === "uploading" && !failed && (
                    <span className="shrink-0 text-[10px] opacity-80">{pct}%</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {entry.body && (
          <div className="flex max-w-full items-end gap-2 rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground opacity-90">
            <span className="whitespace-pre-wrap break-words">{entry.body}</span>
            <Clock className="ml-1 h-3 w-3 shrink-0 translate-y-0.5 opacity-70" />
          </div>
        )}
        {entry.body &&
          (() => {
            const previewUrl = firstUrl(entry.body);
            return previewUrl ? <LinkPreviewCard url={previewUrl} mine /> : null;
          })()}
        {failed ? (
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words text-right">
              {entry.errorMessage || "Failed to send"}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="px-1 text-[10px] text-muted-foreground">
            {entry.status === "uploading" ? "Uploading…" : "Sending…"}
          </div>
        )}
      </div>
    </div>
  );
}

type MessageActionHandlers = {
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onCreateTask?: () => void;
  onToggleImportant?: () => void;
  important?: boolean;
};

function ActionsMenuContent({
  onReact,
  onReply,
  onCopy,
  onDelete,
  onEdit,
  onCreateTask,
  onToggleImportant,
  important,
}: MessageActionHandlers) {
  return (
    <DropdownMenuContent align="end" className="min-w-56 p-1.5" sideOffset={6}>
      <div className="flex items-center gap-0.5 px-1 py-1.5">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onReact(e)}
            className="grid size-9 place-items-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-surface"
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onReply} className="min-h-10 gap-3 text-sm">
        <Reply className="h-4 w-4" />
        <span className="flex-1">Reply</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onCopy} className="min-h-10 gap-3 text-sm">
        <Copy className="h-4 w-4" />
        <span className="flex-1">Copy</span>
      </DropdownMenuItem>
      {onToggleImportant && (
        <DropdownMenuItem onClick={onToggleImportant} className="min-h-10 gap-3 text-sm">
          <Star
            className={cn(
              "h-4 w-4",
              important && "fill-amber-400 text-amber-400",
            )}
          />
          <span className="flex-1">
            {important ? "Remove from important" : "Mark as important"}
          </span>
        </DropdownMenuItem>
      )}
      {onEdit && (
        <DropdownMenuItem onClick={onEdit} className="min-h-10 gap-3 text-sm">
          <Pencil className="h-4 w-4" />
          <span className="flex-1">Edit</span>
        </DropdownMenuItem>
      )}
      {onCreateTask && (
        <DropdownMenuItem onClick={onCreateTask} className="min-h-10 gap-3 text-sm">
          <CheckSquare className="h-4 w-4" />
          <span className="flex-1">Create task</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onDelete} variant="destructive" className="min-h-10 gap-3 text-sm">
        <Trash2 className="h-4 w-4" />
        <span className="flex-1">Delete</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Desktop hover ⋮ only — mobile uses the selection header instead. */
function MessageCaret({
  mine,
  ...handlers
}: { mine: boolean } & MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Message actions"
        className={cn(
          "absolute top-1 hidden size-8 place-items-center rounded-full opacity-0 shadow-sm backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100 lg:grid",
          mine
            ? "right-1 bg-primary/80 text-primary-foreground hover:bg-primary"
            : "right-1 bg-background/90 text-muted-foreground hover:bg-background hover:text-foreground",
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}

function FileCaretMenu(handlers: MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label="Message actions"
        className="hidden size-8 place-items-center rounded-full bg-surface-2 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100 lg:grid"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}

function ImageActionsMenu(handlers: MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label="Message actions"
        className="grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}
