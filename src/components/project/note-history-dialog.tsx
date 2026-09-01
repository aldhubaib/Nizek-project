"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, History, CalendarClock } from "lucide-react";
import {
  editTimelineDescription,
  type NoteTimelineEvent,
  type NoteTimelineUser,
} from "@/lib/note-timeline";
import type { ParagraphChange } from "@/lib/note-content-diff";
import { cn } from "@/lib/utils";
import { Avatar as UiAvatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function person(user: NoteTimelineUser) {
  return user.name ?? "Someone";
}

function describeEvent(entry: NoteTimelineEvent): string {
  if (entry.kind === "created") {
    return `${person(entry.user)} created this note`;
  }
  if (entry.kind === "comment") {
    return entry.isReply
      ? `${person(entry.user)} replied`
      : `${person(entry.user)} commented`;
  }
  if (entry.kind === "task") {
    const label = entry.taskCode ? `${entry.taskCode} ${entry.taskTitle}` : entry.taskTitle;
    return `${person(entry.user)} linked a task · ${label}`;
  }
  if (entry.kind === "edited") {
    const name = person(entry.user);
    if (entry.field === "title" && entry.oldValue && entry.newValue) {
      return `${name} changed the title from “${entry.oldValue}” to “${entry.newValue}”`;
    }
    const action = editTimelineDescription(entry.field, entry.oldValue, entry.newValue);
    return `${name} ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  }
  return `Nizek Bot sent reminder · ${entry.label}`;
}

function Quote({ children, className }: { children: string; className?: string }) {
  return (
    <blockquote
      className={cn(
        "mt-1.5 border-s-2 ps-2.5 text-xs italic leading-relaxed text-muted-foreground",
        className ?? "border-border",
      )}
    >
      {children}
    </blockquote>
  );
}

function ParagraphChanges({ changes }: { changes: ParagraphChange[] }) {
  return (
    <div className="mt-1.5 space-y-2">
      {changes.map((change, i) => (
        <div key={i} className="rounded-md bg-muted/40 px-2.5 py-2">
          {change.type === "removed" ? (
            <>
              <Quote className="border-destructive/50">{change.before ?? ""}</Quote>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                was deleted
              </p>
            </>
          ) : null}
          {change.type === "added" ? (
            <>
              <Quote className="border-success/50">{change.after ?? ""}</Quote>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                was added
              </p>
            </>
          ) : null}
          {change.type === "changed" ? (
            <>
              <Quote className="border-destructive/50">{change.before ?? ""}</Quote>
              <p className="mt-1 text-xs text-muted-foreground/70">was changed to</p>
              <Quote className="border-success/50">{change.after ?? ""}</Quote>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Avatar({ user }: { user: NoteTimelineUser }) {
  return (
    <UiAvatar size="xs" className="ring-2 ring-card">
      {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback className="font-bold">
        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </UiAvatar>
  );
}

function TimelineRow({ entry }: { entry: NoteTimelineEvent }) {
  const icon =
    entry.kind === "reminder" ? (
      <div className="w-[18px] h-[18px] rounded-full bg-destructive/15 ring-2 ring-card flex items-center justify-center">
        <CalendarClock className="w-2.5 h-2.5 text-destructive" />
      </div>
    ) : (
      <Avatar user={entry.user} />
    );

  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-s text-foreground/80 leading-snug">{describeEvent(entry)}</p>
        {entry.kind === "edited" && entry.paragraphChanges && entry.paragraphChanges.length > 0 ? (
          <ParagraphChanges changes={entry.paragraphChanges} />
        ) : null}
        {entry.kind === "comment" ? (
          <>
            {entry.quoteText ? (
              <>
                <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  On this paragraph
                </p>
                <Quote className="border-orange/60">{entry.quoteText}</Quote>
              </>
            ) : null}
            <p className="mt-1.5 text-s leading-relaxed text-foreground">{entry.comment}</p>
          </>
        ) : null}
        {entry.kind === "task" && entry.quoteText ? (
          <>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              From this paragraph
            </p>
            <Quote className="border-success/60">{entry.quoteText}</Quote>
          </>
        ) : null}
        <span className="text-xs text-muted-foreground/50 mt-1 block">
          {timeAgo(entry.at)}
        </span>
      </div>
    </div>
  );
}

interface Props {
  events: NoteTimelineEvent[];
  onClose: () => void;
}

export function NoteHistoryDialog({ events, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-[36rem] w-full mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-s font-semibold">Note History</h3>
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
              <History className="w-6 h-6 text-muted-foreground opacity-40" strokeWidth={1.5} />
              <p className="text-xs text-muted-foreground/60">Nothing to show</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-0">
                {events.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
