"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Megaphone, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { formatUnreadBadge } from "@/lib/chat-unread";
import { prefetchInboxThread } from "@/lib/thread-cache";
import type { InboxThread, ImportantMessageDTO } from "@/actions/messages";

export function formatRelative(iso: string) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

export function unreadTotal(threads: InboxThread[]) {
  return threads.reduce((sum, thread) => sum + Math.max(0, thread.unread), 0);
}

export const ThreadRow = memo(function ThreadRow({
  thread,
  active,
  isOnline,
  currentMemberId,
}: {
  thread: InboxThread;
  active: boolean;
  isOnline: boolean;
  currentMemberId: string;
}) {
  const prefetch = () => {
    if (active) return;
    prefetchInboxThread(thread, currentMemberId);
  };
  return (
    <Link
      href={`/dashboard/messages/${thread.id}`}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      className={cn(
        // WhatsApp-like row: tall touch target (~72–80px), large avatar, roomy padding.
        "flex min-h-[76px] items-center gap-m border-b border-border/30 px-app py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
        active && "bg-surface/80",
        !thread.inactive && thread.unread > 0 && !active && "bg-primary/[0.05]",
        thread.inactive && "opacity-70 hover:opacity-100",
        thread.inactive && active && "opacity-100",
      )}
    >
      <div className="relative shrink-0">
        {thread.kind === "announcements" ? (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11">
            <Megaphone className="h-5 w-5" />
          </div>
        ) : thread.logoUrl || thread.peerImageUrl ? (
          <Image
            src={(thread.logoUrl ?? thread.peerImageUrl) as string}
            alt=""
            width={52}
            height={52}
            className="h-12 w-12 rounded-full object-cover max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11"
          />
        ) : (
          <div
            className="grid h-12 w-12 place-items-center rounded-full text-s font-semibold text-white max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11 lg:text-s"
            style={{ background: thread.avatar }}
            aria-hidden
          >
            {thread.initials}
          </div>
        )}
        {isOnline && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-s font-medium leading-tight",
              thread.unread > 0 && !active && "font-semibold text-foreground",
              thread.inactive && "text-muted-foreground",
            )}
          >
            {thread.name}
          </span>
          {thread.kind === "client" && !thread.inactive && (
            <StatusBadge config={outlineBadge("Client", "text-orange", "border-orange/30")} className="uppercase tracking-wide" />
          )}
          {thread.inactive && (
            <StatusBadge config={outlineBadge("Inactive", "text-muted-foreground", "border-border")} className="uppercase tracking-wide" />
          )}
          <span
            className={cn(
              "ms-auto shrink-0 text-xs leading-none",
              thread.unread > 0 && !active
                ? "font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {formatRelative(thread.lastAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "min-w-0 flex-1 truncate text-s leading-snug max-lg:text-s",
              thread.unread > 0 && !active
                ? "text-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {thread.lastAuthor
              ? `${thread.lastAuthor}: ${thread.lastMessage}`
              : thread.subtitle}
          </div>
          {thread.unread > 0 && !active && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">
              {formatUnreadBadge(thread.unread)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

export const ImportantMessageRow = memo(function ImportantMessageRow({
  message,
  active,
}: {
  message: ImportantMessageDTO;
  active: boolean;
}) {
  return (
    <Link
      href={`/dashboard/messages/${message.threadId}?msg=${message.id}`}
      className={cn(
        "flex min-h-[76px] items-center gap-m border-b border-border/30 px-app py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
        active && "bg-surface/80",
      )}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-orange/15 max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11">
        <Star className="h-5 w-5 fill-orange text-orange" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-s font-medium leading-tight">
            {message.threadName}
          </span>
          <span className="ms-auto shrink-0 text-s text-muted-foreground">
            {formatRelative(message.createdAt)}
          </span>
        </div>
        <p className="truncate text-s text-muted-foreground">
          <span className="text-foreground/80">{message.authorName}:</span>{" "}
          {message.body}
        </p>
      </div>
    </Link>
  );
});

export function ThreadGroup({
  label,
  icon: Icon,
  threads,
  open,
  onToggle,
  pathname,
  online,
  currentMemberId,
}: {
  label: string;
  icon: LucideIcon;
  threads: InboxThread[];
  open: boolean;
  onToggle: () => void;
  pathname: string;
  online: Set<string>;
  currentMemberId: string;
}) {
  if (threads.length === 0) return null;
  const unread = unreadTotal(threads);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-border/40 bg-surface/30 px-app py-2.5 text-s font-medium text-muted-foreground transition-colors hover:bg-surface/60"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold leading-none text-muted-foreground"
          title={`${threads.length} chat${threads.length === 1 ? "" : "s"}`}
        >
          {threads.length}
        </span>
        <span className="ms-auto flex items-center gap-2">
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">
              {formatUnreadBadge(unread)}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && (
        <ul>
          {threads.map((thread) => (
            <li key={thread.id}>
              <ThreadRow
                thread={thread}
                active={pathname === `/dashboard/messages/${thread.id}`}
                isOnline={
                  thread.kind === "direct" &&
                  thread.peerMemberIds.some((id) => online.has(id))
                }
                currentMemberId={currentMemberId}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
