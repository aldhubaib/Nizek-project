"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bug,
  CalendarClock,
  FileText,
  Gavel,
  MessageCircleQuestion,
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
  dueDate: "due date",
  startedAt: "starting date",
  workingDays: "efforts",
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
      accent: "text-orange",
      border: "border-orange/35",
      ring: "ring-orange/20",
      iconWrap: "bg-orange/10 text-orange",
      button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
      quote: "border-orange/60",
    },
  },
  CLARIFICATION: {
    icon: MessageCircleQuestion,
    theme: {
      accent: "text-sky-400",
      border: "border-sky-500/35",
      ring: "ring-sky-500/20",
      iconWrap: "bg-sky-500/10 text-sky-400",
      button: "border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 text-sky-400",
      quote: "border-sky-400/60",
    },
  },
  DEADLINE: {
    icon: CalendarClock,
    theme: {
      accent: "text-destructive",
      border: "border-destructive/35",
      ring: "ring-destructive/20",
      iconWrap: "bg-destructive/10 text-destructive",
      button: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive",
      quote: "border-destructive/60",
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
      accent: "text-orange",
      border: "border-orange/35",
      ring: "ring-orange/20",
      iconWrap: "bg-orange/10 text-orange",
      button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
      quote: "border-orange/60",
    },
  },
  REPORTED_BUG: {
    icon: AlertCircle,
    theme: {
      accent: "text-destructive",
      border: "border-destructive/35",
      ring: "ring-destructive/20",
      iconWrap: "bg-destructive/10 text-destructive",
      button: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive",
      quote: "border-destructive/60",
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
              "border-s-2 ps-3 text-s italic text-muted-foreground",
              visual.theme.quote ?? "border-primary/60",
            )}
          >
            {payload.excerpt}
          </blockquote>
        ) : null}
        {payload.action === "updated" && changed.length > 0 ? (
          <p className="whitespace-pre-wrap text-s leading-relaxed text-foreground">
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
