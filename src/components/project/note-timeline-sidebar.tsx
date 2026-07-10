"use client";

import { format } from "date-fns";
import { CalendarClock, History, Pencil, User } from "lucide-react";
import { editTimelineDescription, type NoteTimelineEvent } from "@/lib/note-timeline";
import { cn } from "@/lib/utils";

export function NoteTimelineSidebar({ events }: { events: NoteTimelineEvent[] }) {
  return (
    <div className="w-80 border-l border-border bg-card/50 overflow-y-auto shrink-0">
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <History className="w-4 h-4" />
          History
        </h3>
        <div className="space-y-0">
          {events.map((entry, idx) => {
            const isLast = idx === events.length - 1;
            const Icon =
              entry.kind === "created"
                ? User
                : entry.kind === "reminder"
                  ? CalendarClock
                  : Pencil;

            return (
              <div key={entry.id} className="relative pl-5">
                {!isLast && (
                  <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
                )}
                <div
                  className={cn(
                    "absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-border bg-background flex items-center justify-center",
                    entry.kind === "reminder" && "border-rose-500/40",
                    entry.kind === "created" && "border-primary/40",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-2 h-2",
                      entry.kind === "reminder"
                        ? "text-rose-400"
                        : entry.kind === "created"
                          ? "text-primary"
                          : "text-muted-foreground",
                    )}
                  />
                </div>
                <div className="pb-5">
                  {entry.kind === "created" && (
                    <>
                      <p className="text-[12px] font-medium text-foreground">
                        {entry.user.name ?? "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Created this note
                      </p>
                    </>
                  )}
                  {entry.kind === "edited" && (
                    <>
                      <p className="text-[12px] font-medium text-foreground">
                        {entry.user.name ?? "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {entry.field === "title" && entry.oldValue ? (
                          <>
                            Changed title
                            <span className="block mt-0.5">
                              <span className="line-through text-muted-foreground/40">
                                {entry.oldValue}
                              </span>
                              {" → "}
                              <span className="text-foreground/80">{entry.newValue}</span>
                            </span>
                          </>
                        ) : (
                          editTimelineDescription(
                            entry.field,
                            entry.oldValue,
                            entry.newValue,
                          )
                        )}
                      </p>
                    </>
                  )}
                  {entry.kind === "reminder" && (
                    <>
                      <p className="text-[12px] font-medium text-foreground">Nizek Bot</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Reminder sent · {entry.label}
                      </p>
                    </>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    {format(new Date(entry.at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
