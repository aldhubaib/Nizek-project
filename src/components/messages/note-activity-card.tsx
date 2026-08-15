"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bug,
  CalendarClock,
  FileText,
  Gavel,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  noteActivityCategory,
  type NoteActivityPayload,
} from "@/lib/note-activity-payload";
import {
  ActivityCard,
  type ActivityCardTheme,
} from "@/components/messages/activity-card";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";
import { cn } from "@/lib/utils";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  content: "content",
  date: "date",
  roadmapStatus: "status",
};

const PRIMARY: ActivityCardTheme = {
  accent: "text-primary",
  border: "border-primary/30",
  ring: "ring-primary/15",
  iconWrap: "bg-primary/10 text-primary",
  button: "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary",
  quote: "border-primary/60",
};

const NOTE_THEME: Record<string, { icon: LucideIcon; theme: ActivityCardTheme }> = {
  MEETING_NOTE: { icon: FileText, theme: PRIMARY },
  DECISION: {
    icon: Gavel,
    theme: {
      accent: "text-amber-400",
      border: "border-amber-500/35",
      ring: "ring-amber-500/20",
      iconWrap: "bg-amber-500/10 text-amber-400",
      button: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400",
      quote: "border-amber-400/60",
    },
  },
  DEADLINE: {
    icon: CalendarClock,
    theme: {
      accent: "text-rose-400",
      border: "border-rose-500/35",
      ring: "ring-rose-500/20",
      iconWrap: "bg-rose-500/10 text-rose-400",
      button: "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400",
      quote: "border-rose-400/60",
    },
  },
  FEATURE: { icon: Sparkles, theme: PRIMARY },
  ENHANCEMENT: {
    icon: Wrench,
    theme: {
      accent: "text-violet-400",
      border: "border-violet-500/35",
      ring: "ring-violet-500/20",
      iconWrap: "bg-violet-500/10 text-violet-400",
      button: "border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 text-violet-400",
      quote: "border-violet-400/60",
    },
  },
  BUG: {
    icon: Bug,
    theme: {
      accent: "text-amber-400",
      border: "border-amber-500/35",
      ring: "ring-amber-500/20",
      iconWrap: "bg-amber-500/10 text-amber-400",
      button: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400",
      quote: "border-amber-400/60",
    },
  },
  REPORTED_BUG: {
    icon: AlertCircle,
    theme: {
      accent: "text-red-400",
      border: "border-red-500/35",
      ring: "ring-red-500/20",
      iconWrap: "bg-red-500/10 text-red-400",
      button: "border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400",
      quote: "border-red-400/60",
    },
  },
  DESIGN: {
    icon: Palette,
    theme: {
      accent: "text-cyan-400",
      border: "border-cyan-500/35",
      ring: "ring-cyan-500/20",
      iconWrap: "bg-cyan-500/10 text-cyan-400",
      button: "border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-400",
      quote: "border-cyan-400/60",
    },
  },
};

export function NoteActivityCard({
  payload,
  createdAt,
}: {
  payload: NoteActivityPayload;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const visual = NOTE_THEME[payload.noteType] ?? { icon: FileText, theme: PRIMARY };
  const changed = (payload.fields ?? [])
    .map((f) => FIELD_LABEL[f] ?? f)
    .filter(Boolean);
  const category = noteActivityCategory(payload);

  return (
    <>
      <ActivityCard
        theme={visual.theme}
        icon={visual.icon}
        category={category}
        title={payload.noteTitle.trim() || "Untitled"}
        onAction={() => setOpen(true)}
        actionLabel="Open original note"
        createdAt={createdAt}
      >
        {payload.excerpt ? (
          <blockquote
            className={cn(
              "border-l-2 pl-3 text-[12px] italic text-muted-foreground",
              visual.theme.quote ?? "border-primary/60",
            )}
          >
            {payload.excerpt}
          </blockquote>
        ) : null}
        {payload.action === "updated" && changed.length > 0 ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            Changed {changed.join(", ")}
          </p>
        ) : null}
      </ActivityCard>
      <NoteCommentReplyDialog
        open={open}
        onOpenChange={setOpen}
        noteId={payload.noteId}
        noteTitle={payload.noteTitle.trim() || "Untitled"}
        projectId={payload.projectId}
      />
    </>
  );
}
