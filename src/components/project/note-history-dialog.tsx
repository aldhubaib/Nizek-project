"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, History, CalendarClock } from "lucide-react";
import {
  editTimelineDescription,
  type NoteTimelineEvent,
  type NoteTimelineUser,
} from "@/lib/note-timeline";

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

function describeEvent(entry: NoteTimelineEvent): string {
  if (entry.kind === "created") {
    return `${entry.user.name ?? "Someone"} created this note`;
  }
  if (entry.kind === "edited") {
    const name = entry.user.name ?? "Someone";
    if (entry.field === "title" && entry.oldValue && entry.newValue) {
      return `${name} changed title from "${entry.oldValue}" to "${entry.newValue}"`;
    }
    const action = editTimelineDescription(entry.field, entry.oldValue, entry.newValue);
    return `${name} ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  }
  return `Nizek Bot sent reminder · ${entry.label}`;
}

function Avatar({ user }: { user: NoteTimelineUser }) {
  if (user.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt=""
        className="w-[18px] h-[18px] rounded-full ring-2 ring-card object-cover"
      />
    );
  }
  return (
    <div className="w-[18px] h-[18px] rounded-full bg-muted ring-2 ring-card flex items-center justify-center">
      <span className="text-[7px] font-bold text-muted-foreground">
        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
      </span>
    </div>
  );
}

function TimelineRow({ entry }: { entry: NoteTimelineEvent }) {
  const isReminder = entry.kind === "reminder";

  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        {isReminder ? (
          <div className="w-[18px] h-[18px] rounded-full bg-rose-500/15 ring-2 ring-card flex items-center justify-center">
            <CalendarClock className="w-2.5 h-2.5 text-rose-400" />
          </div>
        ) : (
          <Avatar user={entry.user} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-foreground/80 leading-snug">{describeEvent(entry)}</p>
        <span className="text-[10px] text-muted-foreground/50 mt-1 block">
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-[13px] font-semibold">Note History</h3>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
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
              <p className="text-[11px] text-muted-foreground/60">Nothing to show</p>
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
