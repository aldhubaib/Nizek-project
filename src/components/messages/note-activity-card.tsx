import {
  AlertCircle,
  Bug,
  CalendarClock,
  FileText,
  Gavel,
  Package,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  noteActivityUrl,
  type NoteActivityPayload,
} from "@/lib/note-activity-payload";
import {
  ActivityCard,
  type ActivityCardTheme,
} from "@/components/messages/activity-card";

const TYPE_LABEL: Record<string, string> = {
  MEETING_NOTE: "Meeting Note",
  DECISION: "Decision",
  DEADLINE: "Deadline",
  PRODUCT: "Product",
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  content: "content",
  date: "date",
};

const PRIMARY: ActivityCardTheme = {
  accent: "text-primary",
  border: "border-primary/30",
  ring: "ring-primary/15",
  iconWrap: "bg-primary/10 text-primary",
  button: "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary",
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
    },
  },
  PRODUCT: {
    icon: Package,
    theme: {
      accent: "text-emerald-400",
      border: "border-emerald-500/35",
      ring: "ring-emerald-500/20",
      iconWrap: "bg-emerald-500/10 text-emerald-400",
      button: "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400",
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
  const typeLabel = TYPE_LABEL[payload.noteType] ?? payload.noteType;
  const visual = NOTE_THEME[payload.noteType] ?? { icon: FileText, theme: PRIMARY };
  const changed = (payload.fields ?? [])
    .map((f) => FIELD_LABEL[f] ?? f)
    .filter(Boolean);
  const category =
    payload.action === "created"
      ? `Note created · ${typeLabel}`
      : `Note updated · ${typeLabel}`;

  return (
    <ActivityCard
      theme={visual.theme}
      icon={visual.icon}
      category={category}
      title={payload.noteTitle.trim() || "Untitled"}
      href={noteActivityUrl(payload.projectId, payload.noteId)}
      actionLabel={`Open original note · ${payload.noteTitle.trim() || "Untitled"}`}
      createdAt={createdAt}
    >
      {payload.action === "updated" && changed.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">Changed {changed.join(", ")}</p>
      ) : null}
    </ActivityCard>
  );
}
