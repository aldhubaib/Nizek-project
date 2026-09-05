"use client";

import { memo, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertOctagon,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckSquare,
  Star,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { shouldCommitSwipeReply } from "@/lib/swipe-reply";
import { firstUrl } from "@/lib/link-preview";
import { formatUnreadSeparator } from "@/lib/chat-unread";
import type { MessageAttachment, ReactionSummary } from "@/actions/messages";
import {
  AttachmentBubble,
  isVoiceAttachment,
  isVideoAttachment,
} from "@/components/messages/chat-attachments";
import { LinkPreviewCard } from "@/components/messages/link-preview";
import { ReplyContext } from "@/components/messages/reply-context";
import { DeadlineReminderCard } from "@/components/messages/deadline-reminder-card";
import {
  ChatPostAvatar,
  chatPostAuthorLabel,
} from "@/components/messages/activity-card";
import { NoteCommentCard } from "@/components/messages/note-comment-card";
import { TaskCommentCard } from "@/components/messages/task-comment-card";
import { NoteActivityCard } from "@/components/messages/note-activity-card";
import { ClientIssueCard } from "@/components/messages/client-issue-card";
import { TaskRejectionCard } from "@/components/messages/task-rejection-card";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import {
  ProofOfWorkCard,
  isProofOfWorkChatMessage,
} from "@/components/messages/proof-of-work-card";
import {
  FileCaretMenu,
  ImageActionsMenu,
  MessageCaret,
  type MessageActionHandlers,
} from "./message-actions";
import {
  QUICK_EMOJIS,
  fmtTaskNumber,
  formatDay,
  formatTime,
  initialsFrom,
  isDesktopViewport,
  renderMessageBody,
  type ChatMessage,
} from "./thread-shared";

const ProofBypassCard = dynamic(
  () => import("@/components/messages/proof-bypass-card").then((m) => m.ProofBypassCard),
  { ssr: false },
);

export function UnreadSeparator({ count }: { count: number }) {
  const label = formatUnreadSeparator(count);
  if (!label) return null;
  return (
    <div
      id="unread-separator"
      className="my-3 flex items-center gap-3"
      role="separator"
      aria-label={label}
    >
      <div className="h-px flex-1 bg-primary/40" />
      <span className="shrink-0 rounded-full bg-primary/15 px-3 py-0.5 text-xs font-semibold text-primary">
        {label}
      </span>
      <div className="h-px flex-1 bg-primary/40" />
    </div>
  );
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
                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-s leading-none transition-colors",
                mineReacted
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border/60 bg-surface/60 text-muted-foreground hover:bg-surface",
              )}
            >
              <span>{r.emoji}</span>
              <span className="text-xs font-medium">{r.memberIds.length}</span>
            </PopoverTrigger>
            <PopoverContent
              align={mine ? "end" : "start"}
              side="top"
              className="w-56 gap-0 p-1.5"
            >
              <div className="px-2 py-1.5 text-s font-medium text-muted-foreground">
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
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
                        aria-hidden
                      >
                        {initialsFrom(
                          id === currentMemberId
                            ? (memberNames[id] ?? "You")
                            : fullName,
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-s">
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => onToggle(r.emoji)}
                className="mt-0.5 w-full rounded-md px-2 py-2 text-left text-s text-muted-foreground hover:bg-surface hover:text-foreground"
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
        "ml-1 inline-flex shrink-0 translate-y-0.5 items-center gap-0.5 text-xs leading-none",
        blue ? "text-primary-foreground/70" : "text-muted-foreground",
      )}
    >
      {important && (
        <Star
          className="h-3 w-3 fill-orange text-orange"
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

export const MessageRow = memo(function MessageRow({
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
  searchQuery,
  searchCurrent,
  projectName,
  isClientViewer = false,
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
  searchQuery?: string;
  searchCurrent?: boolean;
  projectName?: string;
  /** Feed cards open a client-safe view instead of the staff workspace. */
  isClientViewer?: boolean;
}) {
  const imageAtts = m.attachments.filter((a) => a.isImage);
  const videoAtts = m.attachments.filter((a) => isVideoAttachment(a));
  const fileAtts = m.attachments.filter((a) => !a.isImage && !isVideoAttachment(a));
  const nestMedia =
    (imageAtts.length > 0 || videoAtts.length > 0) &&
    Boolean(m.body || editing) &&
    m.kind !== "rejection";
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
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

  const toggleReaction = useCallback(
    (emoji: string) => react(m.id, emoji),
    [react, m.id],
  );

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
    if (isDesktopViewport()) return;
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

  if (m.noteActivity || m.clientIssue || m.noteComment || m.taskComment || m.deadlineReminder || m.proofBypass || m.kind === "proof_bypass" || m.kind === "rejection" || isProofOfWorkChatMessage(m)) {
    const authorLabel = chatPostAuthorLabel(m.authorId, m.authorName);
    return (
      <div id={`msg-${m.id}`} className={cn(dimmed && "opacity-30")}>
        {showDay && (
          <div className="my-2 flex items-center justify-center">
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
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
              <div className="px-1 text-xs text-muted-foreground">{authorLabel}</div>
            )}
            {m.deadlineReminder ? (
              <DeadlineReminderCard
                payload={m.deadlineReminder}
                createdAt={m.createdAt}
                projectName={projectName}
              />
            ) : m.noteActivity ? (
              <NoteActivityCard
                payload={m.noteActivity}
                createdAt={m.createdAt}
                projectName={projectName}
                isClientViewer={isClientViewer}
              />
            ) : m.clientIssue ? (
              <ClientIssueCard
                payload={m.clientIssue}
                createdAt={m.createdAt}
                projectName={projectName}
                isClientViewer={isClientViewer}
              />
            ) : m.taskComment ? (
              <TaskCommentCard
                payload={m.taskComment}
                createdAt={m.createdAt}
                projectName={projectName}
              />
            ) : m.kind === "rejection" ? (
              <TaskRejectionCard
                title={m.task?.title ?? "Task"}
                taskNumber={m.task?.number}
                projectId={m.task?.projectId}
                projectName={projectName}
                taskId={m.task?.id}
                body={m.body}
                mentions={m.mentions}
                attachments={m.attachments}
                createdAt={m.createdAt}
                onOpenImage={openImage}
              />
            ) : m.kind === "proof_bypass" || m.proofBypass ? (
              m.proofBypass ? (
                <ProofBypassCard
                  payload={m.proofBypass}
                  createdAt={m.createdAt}
                  currentUserId={currentMemberId}
                />
              ) : (
                <p className="text-s text-muted-foreground">Video bypass request</p>
              )
            ) : isProofOfWorkChatMessage(m) && m.task ? (
              <ProofOfWorkCard
                taskId={m.task.id}
                projectId={m.task.projectId}
                projectName={projectName}
                taskNumber={m.task.number}
                taskTitle={m.task.title}
                body={m.body}
                videos={videoAtts}
                createdAt={m.createdAt}
              />
            ) : (
              <NoteCommentCard
                payload={m.noteComment!}
                createdAt={m.createdAt}
                projectName={projectName}
              />
            )}
            {imageAtts.length > 0 && m.kind !== "rejection" && (
              <div className="flex max-w-full flex-wrap gap-xs justify-start">
                {imageAtts.map((a) => (
                  <AttachmentBubble
                    key={a.id}
                    attachment={a}
                    mine={false}
                    onOpenImage={openImage}
                  />
                ))}
              </div>
            )}
            {videoAtts.length > 0 && !isProofOfWorkChatMessage(m) && m.kind !== "rejection" && (
              <div
                className={cn(
                  "max-w-full",
                  videoAtts.length > 1
                    ? "grid w-full max-w-[20rem] grid-cols-2 gap-1.5"
                    : "flex w-full max-w-[20rem] flex-col",
                )}
              >
                {videoAtts.map((a) => (
                  <AttachmentBubble
                    key={a.id}
                    attachment={a}
                    mine={false}
                    onOpenImage={openImage}
                  />
                ))}
              </div>
            )}
            {fileAtts.length > 0 && m.kind !== "rejection" && (
              <div className="flex max-w-full flex-wrap gap-xs justify-start">
                {fileAtts.map((a) => (
                  <AttachmentBubble
                    key={a.id}
                    attachment={a}
                    mine={false}
                    onOpenImage={openImage}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${m.id}`} className={cn(dimmed && "opacity-30")}>
      {showDay && (
        <div className="my-2 flex items-center justify-center">
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
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
                  className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
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
        <div className={cn("relative flex min-w-0 max-w-[70%] flex-col gap-xs", mine ? "ml-auto items-end" : "items-start")}>
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
            <div className="px-1 text-xs text-muted-foreground">{m.authorName}</div>
          )}
          {(replied || m.body || (m.task && showTaskCard) || editing) && (() => {
            const notice = (!!m.task && showTaskCard) || m.kind === "rejection";
            const blue = mine && !notice;
            const hasBubble = Boolean(m.body || (m.task && showTaskCard) || editing);
            return (
            <div
              className={cn(
                "flex min-w-0 max-w-full flex-col gap-1",
                mine ? "items-end" : "items-start",
              )}
            >
              {replied && (
                <ReplyContext
                  authorLabel={
                    replied.authorId === currentMemberId ? "You" : replied.authorName
                  }
                  body={replied.body}
                  attachments={replied.attachments}
                  mine={mine}
                  onClick={() => scrollToMessage(m.replyToId!)}
                />
              )}
              {hasBubble && (
            <div
              className={cn(
                "group relative max-w-full",
                nestMedia && "w-80 max-w-full",
                mine ? "self-end" : "self-start",
              )}
            >
              <div
                className={cn(
                  "flex max-w-full flex-col text-s leading-relaxed",
                  notice
                    ? "w-full min-w-64 gap-xs rounded-xl border border-border/60 bg-surface-2/80 p-2.5 text-foreground"
                    : nestMedia
                      ? "w-full gap-2 p-2"
                      : "gap-xs px-3.5 py-2",
                  !notice && "rounded-2xl",
                  !notice &&
                    (blue
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-surface-2 text-foreground"),
                )}
              >
                {m.task && showTaskCard && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTaskPanelOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-field/60 px-2.5 py-2 text-left transition-colors hover:bg-field"
                  >
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Task · #{fmtTaskNumber(m.task.number)}
                      </div>
                      <div className="truncate text-s font-semibold text-foreground">
                        {m.task.title}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                )}
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => onEditDraftChange(e.target.value)}
                      className="min-h-[4rem] w-full resize-none rounded-md border border-border/60 bg-background px-2 py-1.5 text-s text-foreground"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        className="rounded-full px-3 py-1 text-s text-muted-foreground hover:bg-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSaveEdit}
                        className="rounded-full bg-primary px-3 py-1 text-s font-medium text-primary-foreground"
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
                          <div className="flex items-start gap-2 rounded-lg border-l-2 border-destructive bg-destructive/10 px-2.5 py-2 text-s">
                            <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold uppercase tracking-wider text-destructive">
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
                              <span className="rounded bg-primary/15 px-1 py-0.5 text-s font-medium text-primary">
                                @{who}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 text-xs leading-none text-muted-foreground">
                              {formatTime(m.createdAt)}
                            </span>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <div className={cn("flex items-end gap-2", notice && "px-0.5", nestMedia && "px-1.5 pt-0.5")}>
                      <span className="whitespace-pre-wrap break-words">
                        {renderMessageBody(
                          m.body,
                          m.mentions,
                          blue,
                          searchQuery,
                          searchCurrent,
                        )}
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
                {nestMedia && (
                  <div className="flex flex-col gap-1.5">
                    {imageAtts.map((a) => (
                      <AttachmentBubble
                        key={a.id}
                        attachment={a}
                        mine={mine}
                        embedded
                        onOpenImage={openImage}
                        menu={
                          <span className="hidden lg:contents">
                            <ImageActionsMenu {...actionHandlers} />
                          </span>
                        }
                      />
                    ))}
                    {videoAtts.length > 0 && (
                      <div
                        className={cn(
                          videoAtts.length > 1
                            ? "grid grid-cols-2 gap-1.5"
                            : "flex flex-col",
                        )}
                      >
                        {videoAtts.map((a) => (
                          <AttachmentBubble
                            key={a.id}
                            attachment={a}
                            mine={mine}
                            embedded
                            onOpenImage={openImage}
                            menu={
                              <span className="hidden lg:contents">
                                <FileCaretMenu {...actionHandlers} />
                              </span>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Desktop only — WhatsApp hover ⋮. Mobile uses selection header. */}
              <MessageCaret mine={mine} {...actionHandlers} />
            </div>
              )}
              {replied &&
                !hasBubble &&
                imageAtts.length === 0 &&
                fileAtts.length === 0 && (
                  <MessageMeta
                    createdAt={m.createdAt}
                    edited={m.edited}
                    mine={mine}
                    blue={false}
                    peerLastReadAt={peerLastReadAt}
                    important={m.important}
                  />
                )}
            </div>
            );
          })()}
          {m.kind !== "rejection" && (() => {
            const previewUrl = firstUrl(m.body);
            return previewUrl ? (
              <LinkPreviewCard url={previewUrl} mine={mine} />
            ) : null;
          })()}
          {imageAtts.length > 0 && !nestMedia && (
            <div
              className={cn(
                "flex max-w-full flex-wrap gap-xs",
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
          {videoAtts.length > 0 && !nestMedia && (
            <div
              className={cn(
                "max-w-full",
                videoAtts.length > 1
                  ? "grid w-80 max-w-full grid-cols-2 gap-1.5"
                  : "flex w-80 max-w-full flex-col",
                mine ? "self-end" : "self-start",
              )}
            >
              {videoAtts.map((a) => (
                <AttachmentBubble
                  key={a.id}
                  attachment={a}
                  mine={mine}
                  onOpenImage={openImage}
                  menu={
                    <span className="hidden lg:contents">
                      <FileCaretMenu {...actionHandlers} />
                    </span>
                  }
                />
              ))}
            </div>
          )}
          {fileAtts.length > 0 && (
            <div className="flex max-w-full flex-col gap-xs">
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
          {!m.body && !editing && (imageAtts.length > 0 || videoAtts.length > 0 || fileAtts.length > 0) && (
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
              onToggle={toggleReaction}
            />
          )}
        </div>
      </div>
      {taskPanelOpen && m.task ? (
        <TaskInboxSlideOver
          taskId={m.task.id}
          href={`/dashboard/projects/${m.task.projectId}/tasks/${m.task.id}`}
          title={m.task.title}
          onClose={() => setTaskPanelOpen(false)}
        />
      ) : null}
    </div>
  );
});
