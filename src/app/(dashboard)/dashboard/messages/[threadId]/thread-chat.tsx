"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
  ChevronDown,
  Reply,
  Copy,
  Forward,
  Pin,
  Star,
  Trash2,
  Clock,
  RotateCcw,
  AlertCircle,
  AlertOctagon,
  ArrowUpRight,
  CheckSquare,
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
import { cn } from "@/lib/utils";
import {
  sendMessage,
  toggleReaction,
  deleteMessage as deleteMessageAction,
  getThreadMessages,
  getProjectTaskRefs,
  type MessageDTO,
  type MessageAttachment,
  type MessageTaskRef,
  type ReactionSummary,
  type TaskPickerItem,
} from "@/actions/messages";
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
import { uploadFileToR2 } from "@/lib/upload";

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

type AttachmentMeta = {
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
};

// Presigned direct-to-R2 upload with progress.
function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<AttachmentMeta> {
  return uploadFileToR2(file, onProgress);
}

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  attachments: MessageAttachment[];
  reactions: ReactionSummary[];
  replyToId?: string | null;
  kind?: string;
  /** Task this message belongs to — rendered as a reference card in project channels. */
  task?: MessageTaskRef | null;
  /** Display names mentioned in the body, highlighted as @chips. */
  mentions?: string[];
};

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

// A file picked in the composer, held locally until the user presses Send.
type PendingFile = { key: string; file: File; previewUrl: string | null };

// A file being uploaded as part of an optimistic (outbox) message.
type OutFile = {
  key: string;
  file: File;
  name: string;
  contentType: string | null;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  url?: string;
};

// A message the user has sent that is still uploading/delivering — rendered as
// a bubble with progress (WhatsApp-style optimistic send).
type OutboxEntry = {
  tempId: string;
  body: string;
  replyToId: string | null;
  /** When set, the message is posted as a comment on this task (# reference). */
  taskRefId: string | null;
  createdAt: string;
  files: OutFile[];
  status: "uploading" | "sending" | "error";
};

// One chat message. Memoized so unrelated parent re-renders (typing indicator,
// presence, composer keystrokes, recording timer) don't re-render every row —
// a row only re-renders when its own `m`/derived props change. Callbacks are
// stable (useCallback in the parent), so `memo` holds.
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
  react,
  handleReply,
  handleCopy,
  handleDelete,
  scrollToMessage,
  openImage,
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
  react: (id: string, emoji: string) => void;
  handleReply: (id: string) => void;
  handleCopy: (text: string) => void;
  handleDelete: (id: string) => void;
  scrollToMessage: (id: string) => void;
  openImage: (att: MessageAttachment) => void;
}) {
  const imageAtts = m.attachments.filter((a) => a.isImage);
  const fileAtts = m.attachments.filter((a) => !a.isImage);

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
        {!mine && (
          <div className="w-8 shrink-0 self-start">
            {showAuthor && (
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
            )}
          </div>
        )}
        <div className={cn("flex max-w-[70%] flex-col gap-1.5", mine && "items-end")}>
          {showAuthor && (
            <div className="px-1 text-tiny text-muted-foreground">{m.authorName}</div>
          )}
          {(m.body || replied || (m.task && showTaskCard)) && (() => {
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
                {m.body &&
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
                      <span
                        className={cn(
                          "ml-1 shrink-0 translate-y-0.5 text-[10px] leading-none",
                          blue
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatTime(m.createdAt)}
                      </span>
                    </div>
                  ))}
              </div>
              <MessageCaret
                mine={mine}
                onReact={(emoji) => react(m.id, emoji)}
                onReply={() => handleReply(m.id)}
                onCopy={() => handleCopy(m.body)}
                onDelete={() => handleDelete(m.id)}
              />
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
                    <ImageActionsMenu
                      onReact={(emoji) => react(m.id, emoji)}
                      onReply={() => handleReply(m.id)}
                      onCopy={() => handleCopy(m.body)}
                      onDelete={() => handleDelete(m.id)}
                    />
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
                    isVoiceAttachment(a) ? formatTime(m.createdAt) : undefined
                  }
                  menu={
                    <FileCaretMenu
                      onReact={(emoji) => react(m.id, emoji)}
                      onReply={() => handleReply(m.id)}
                      onCopy={() => handleCopy(m.body)}
                      onDelete={() => handleDelete(m.id)}
                    />
                  }
                />
              ))}
            </div>
          )}
          {m.reactions.length > 0 && (
            <div className={cn("flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
              {m.reactions.map((r) => {
                const mineReacted = r.memberIds.includes(currentMemberId);
                return (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => react(m.id, r.emoji)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors",
                      mineReacted
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-border/60 bg-surface/60 text-muted-foreground hover:bg-surface",
                    )}
                  >
                    <span>{r.emoji}</span>
                    <span className="text-[10px] font-medium">{r.memberIds.length}</span>
                  </button>
                );
              })}
            </div>
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
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(hasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipAutoScrollRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<"chat" | "files">("chat");
  const [searchOpen, setSearchOpen] = useState(false);
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

  useChannel(channel, (data) => {
    const d = data as
      | {
          type?: string;
          message?: MessageDTO;
          messageId?: string;
          reactions?: ReactionSummary[];
        }
      | null;
    if (!d) return;
    if (d.type === "message.new" && d.message) {
      const m = d.message;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [
          ...prev,
          {
            id: m.id,
            authorId: m.authorId,
            authorName: m.authorName,
            body: m.body,
            createdAt: m.createdAt,
            attachments: m.attachments ?? [],
            reactions: [],
            replyToId: m.replyToId ?? null,
            kind: m.kind,
            task: m.task ?? null,
            mentions: m.mentions ?? [],
          },
        ];
      });
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
  });

  useEffect(() => {
    // Prepending older pages must not yank the user to the bottom.
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing.length, outbox.length]);

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

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
  const mentionToken = useMemo(() => {
    if (mentionables.length === 0) return null;
    const m = /(^|\s)@([^\s@]*)$/.exec(draft);
    if (!m) return null;
    return { start: m.index + m[1].length, query: m[2].toLowerCase() };
  }, [draft, mentionables.length]);

  const mentionResults = useMemo(() => {
    if (!mentionToken) return [];
    const q = mentionToken.query;
    const filtered = q
      ? mentionables.filter((m) => m.name.toLowerCase().includes(q))
      : mentionables;
    return filtered.slice(0, 6);
  }, [mentionToken, mentionables]);
  const mentionPickerOpen = !!mentionToken && mentionResults.length > 0;
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionToken?.query, mentionResults.length]);

  const pickMention = (m: { id: string; name: string }) => {
    if (!mentionToken) return;
    const before = draft.slice(0, mentionToken.start);
    const after = draft.slice(mentionToken.start + 1 + mentionToken.query.length);
    setDraft(`${before}@${m.name} ${after}`.replace(/ {2,}/g, " "));
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  // Files wait locally (no upload) until the user presses Send.
  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked: PendingFile[] = Array.from(files)
      .filter((f) => f.size > 0)
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

  const updateOutFile = useCallback(
    (tempId: string, fileKey: string, patch: Partial<OutFile>) => {
      setOutbox((prev) =>
        prev.map((o) =>
          o.tempId === tempId
            ? {
                ...o,
                files: o.files.map((f) =>
                  f.key === fileKey ? { ...f, ...patch } : f,
                ),
              }
            : o,
        ),
      );
    },
    [],
  );

  // Deliver an outbox entry (all uploads resolved). The bubble stays in the
  // list until the server confirms, then the real message replaces it.
  const deliver = useCallback(
    (entry: OutboxEntry, attachments: AttachmentMeta[]) => {
      setOutbox((prev) =>
        prev.map((o) =>
          o.tempId === entry.tempId ? { ...o, status: "sending" } : o,
        ),
      );
      startTransition(async () => {
        const res = await sendMessage({
          ...target,
          taskId: entry.taskRefId ?? target.taskId,
          body: entry.body,
          attachments,
          replyToId: entry.replyToId ?? undefined,
        });
        if (res.ok) {
          const m = res.data;
          for (const f of entry.files) {
            if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
          }
          setOutbox((prev) => prev.filter((o) => o.tempId !== entry.tempId));
          setMessages((prev) =>
            prev.some((x) => x.id === m.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: m.id,
                    authorId: m.authorId,
                    authorName: m.authorName,
                    body: m.body,
                    createdAt: m.createdAt,
                    attachments: m.attachments,
                    reactions: [],
                    replyToId: entry.replyToId,
                    kind: m.kind,
                    task: m.task ?? null,
                    mentions: m.mentions ?? [],
                  },
                ],
          );
          // No router.refresh(): the message is already shown optimistically and
          // other clients receive it live over Centrifugo. Reconciliation happens
          // on the next navigation / RSC render.
        } else {
          setOutbox((prev) =>
            prev.map((o) =>
              o.tempId === entry.tempId ? { ...o, status: "error" } : o,
            ),
          );
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.taskId, target.projectId, target.conversationId],
  );

  // Upload each of an entry's files, tracking progress; deliver once all are up.
  const startUploads = useCallback(
    (entry: OutboxEntry) => {
      const results: (AttachmentMeta | null)[] = new Array(entry.files.length).fill(null);
      let remaining = entry.files.length;
      let failed = false;
      entry.files.forEach((f, idx) => {
        uploadFile(f.file, (pct) => updateOutFile(entry.tempId, f.key, { progress: pct }))
          .then((meta) => {
            if (failed) return;
            results[idx] = meta;
            updateOutFile(entry.tempId, f.key, {
              status: "done",
              progress: 100,
              url: meta.url,
            });
            remaining -= 1;
            if (remaining === 0) {
              deliver(entry, results.filter((r): r is AttachmentMeta => r !== null));
            }
          })
          .catch(() => {
            failed = true;
            updateOutFile(entry.tempId, f.key, { status: "error" });
            setOutbox((prev) =>
              prev.map((o) =>
                o.tempId === entry.tempId ? { ...o, status: "error" } : o,
              ),
            );
          });
      });
    },
    [deliver, updateOutFile],
  );

  const send = () => {
    let text = draft.trim();
    if (!text && pending.length === 0) return;
    // Convert any "@Full Name" that matches a project member into the
    // @[Name](id) token the server parses. Longest names first so
    // "@Adham Ali" isn't clobbered by "@Adham".
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

    if (files.length === 0) {
      const entry: OutboxEntry = {
        tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        body: text,
        replyToId: replyId,
        taskRefId,
        createdAt: new Date().toISOString(),
        files: [],
        status: "sending",
      };
      setOutbox((prev) => [...prev, entry]);
      deliver(entry, []);
      return;
    }

    const entry: OutboxEntry = {
      tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body: text,
      replyToId: replyId,
      taskRefId,
      createdAt: new Date().toISOString(),
      files: files.map((f) => ({
        key: f.key,
        file: f.file,
        name: f.file.name,
        contentType: f.file.type || null,
        previewUrl: f.previewUrl,
        progress: 0,
        status: "uploading" as const,
      })),
      status: "uploading",
    };
    setOutbox((prev) => [...prev, entry]);
    startUploads(entry);
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
      const entry: OutboxEntry = {
        tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        body: "",
        replyToId: replyTo,
        taskRefId: null,
        createdAt: new Date().toISOString(),
        files: [
          {
            key: `voice-${Date.now()}`,
            file,
            name: file.name,
            contentType: file.type || null,
            previewUrl: null,
            progress: 0,
            status: "uploading",
          },
        ],
        status: "uploading",
      };
      setReplyTo(null);
      setOutbox((prev) => [...prev, entry]);
      startUploads(entry);
    },
    [replyTo, startUploads],
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    } catch {
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

  const retryOutbox = (tempId: string) => {
    const entry = outbox.find((o) => o.tempId === tempId);
    if (!entry) return;
    if (entry.files.length === 0) {
      deliver({ ...entry, status: "sending" }, []);
      return;
    }
    const reset: OutboxEntry = {
      ...entry,
      status: "uploading",
      files: entry.files.map((f) => ({ ...f, status: "uploading", progress: 0, url: undefined })),
    };
    setOutbox((prev) => prev.map((o) => (o.tempId === tempId ? reset : o)));
    startUploads(reset);
  };

  const discardOutbox = (tempId: string) => {
    const entry = outbox.find((o) => o.tempId === tempId);
    if (!entry) return;
    for (const f of entry.files) {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    }
    setOutbox((prev) => prev.filter((o) => o.tempId !== tempId));
  };

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

  const handleReply = useCallback((id: string) => {
    setReplyTo(id);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMessageAction(id);
    });
  }, []);

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

  // First link in the draft — previewed above the composer until dismissed.
  const composerUrl = useMemo(() => {
    const u = firstUrl(draft);
    return u && u !== dismissedPreview ? u : null;
  }, [draft, dismissedPreview]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
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

      {/* Thread header */}
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-3 sm:gap-3 sm:px-4">
        <Link
          href="/dashboard/messages"
          aria-label="Back to inbox"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
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
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
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
            const newGroup = !prev || prev.authorId !== m.authorId || showDay;
            const mine = m.authorId === currentMemberId;
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
                react={react}
                handleReply={handleReply}
                handleCopy={handleCopy}
                handleDelete={handleDelete}
                scrollToMessage={scrollToMessage}
                openImage={openImage}
              />
            );
          })}
          {outbox.map((o) => (
            <OutboxBubble
              key={o.tempId}
              entry={o}
              onRetry={() => retryOutbox(o.tempId)}
              onDiscard={() => discardOutbox(o.tempId)}
            />
          ))}
          {messages.length === 0 && outbox.length === 0 && (
            <div className="py-16 text-center text-xs text-muted-foreground">
              No messages yet. Say hi!
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

      {/* Composer */}
      <div className="shrink-0 border-t border-border/60 p-3">
        <div className="mx-auto max-w-3xl">
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
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                          {m.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
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
          {recording ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface/40 p-2 sm:gap-3">
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
                  {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, "0")}
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
                {recordPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                className="shrink-0 rounded-full bg-success text-background hover:bg-success/90"
                onClick={() => stopRecording(true)}
                aria-label="Send voice message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : (
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-surface/40 p-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Attach"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              <div
                aria-hidden
                ref={mirrorRef}
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-2 text-sm text-foreground"
              >
                {renderComposerHighlight(
                  draft,
                  mentionables.map((m) => m.name),
                )}
                {"\u200b"}
              </div>
            <Textarea
              ref={composerRef}
              value={draft}
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
                if (e.key === "Enter" && !e.shiftKey) {
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
              className="relative min-h-10 w-full resize-none border-0 !bg-transparent p-2 text-sm !text-transparent caret-foreground shadow-none focus-visible:ring-0 dark:!bg-transparent"
              rows={1}
            />
            </div>
            {draft.trim() || pending.length > 0 ? (
              <Button
                size="icon"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={send}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={startRecording}
                aria-label="Record voice message"
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
            return (
              <ImageActionsMenu
                onReact={(emoji) => react(msg.id, emoji)}
                onReply={() => {
                  lb.close();
                  handleReply(msg.id);
                }}
                onCopy={() => handleCopy(msg.body)}
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
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border/60 bg-background shadow-xl">
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
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col bg-background shadow-xl">
          <FilesPanel
            messages={messages.filter((m) => m.attachments.length > 0)}
            onClose={() => setView("chat")}
          />
        </div>
      )}
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
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Failed to send</span>
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
};

function ActionsMenuContent({ onReact, onReply, onCopy, onDelete }: MessageActionHandlers) {
  return (
    <DropdownMenuContent align="end" className="w-52 p-1" sideOffset={4}>
      <div className="flex items-center gap-0.5 px-1 py-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onReact(e)}
            className="grid size-8 place-items-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-surface"
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onReply}>
        <Reply className="h-4 w-4" />
        <span className="flex-1">Reply</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onCopy}>
        <Copy className="h-4 w-4" />
        <span className="flex-1">Copy</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onReply}>
        <Forward className="h-4 w-4" />
        <span className="flex-1">Forward</span>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Pin className="h-4 w-4" />
        <span className="flex-1">Pin</span>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Star className="h-4 w-4" />
        <span className="flex-1">Star</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onDelete} variant="destructive">
        <Trash2 className="h-4 w-4" />
        <span className="flex-1">Delete</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

function MessageCaret({
  mine,
  ...handlers
}: { mine: boolean } & MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Message actions"
        className={cn(
          "absolute top-1 grid size-6 place-items-center rounded-full opacity-0 shadow-sm backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100",
          mine
            ? "right-1 bg-primary/70 text-primary-foreground hover:bg-primary/90"
            : "right-1 bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground",
        )}
      >
        <ChevronDown className="h-3.5 w-3.5" />
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
        className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
      >
        <ChevronDown className="h-4 w-4" />
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
        className="grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}
