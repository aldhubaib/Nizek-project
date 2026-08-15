"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  AlarmClock,
  Calendar,
  SquareCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deadlineReminderTheme,
  type DeadlineReminderPayload,
} from "@/lib/deadline-reminder-payload";
import { ActivityCard } from "@/components/messages/activity-card";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";

export { NizekBotAvatar } from "@/components/messages/activity-card";

export function DeadlineReminderCard({
  payload,
  createdAt,
}: {
  payload: DeadlineReminderPayload;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const theme = deadlineReminderTheme(payload.offsetDays);
  const dueLabel = format(new Date(payload.dueDate), "MMM d, yyyy");

  return (
    <>
      <ActivityCard
        theme={{
          accent: theme.accent,
          border: theme.border,
          ring: theme.ring,
          iconWrap: cn("bg-muted/40", theme.icon),
          button: theme.button,
          pill: theme.pill,
        }}
        icon={AlarmClock}
        category={theme.category}
        title={payload.title}
        status={theme.statusLabel}
        onAction={() => setOpen(true)}
        actionLabel={`Open note · ${payload.title}`}
        actionIcon={SquareCheck}
        createdAt={createdAt}
        footer={
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              This is an automated system message. Mark the note as completed to
              stop receiving this alert.
            </p>
          </div>
        }
      >
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="size-3.5 shrink-0 opacity-70" />
          <span>{dueLabel}</span>
        </div>
        <span className="inline-flex rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground">
          @all
        </span>
      </ActivityCard>
      <NoteCommentReplyDialog
        open={open}
        onOpenChange={setOpen}
        noteId={payload.noteId}
        noteTitle={payload.title}
        projectId={payload.projectId}
      />
    </>
  );
}
