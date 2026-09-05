import {
  AlertCircle,
  Bug,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gavel,
  IterationCcw,
  MessageCircleQuestion,
  Palette,
  Sparkles,
  Wrench,
} from "lucide-react";

export type NoteType =
  | "MEETING_NOTE"
  | "DECISION"
  | "CLARIFICATION"
  | "DEADLINE"
  | "SPRINT_DOC"
  | "SPRINT_PLANNING"
  | "SPRINT_REVIEW"
  | "FEATURE"
  | "ENHANCEMENT"
  | "BUG"
  | "REPORTED_BUG"
  | "DESIGN";

export const NOTE_TYPE_CONFIG: Record<
  NoteType,
  { label: string; color: string; bg: string; icon: typeof FileText }
> = {
  MEETING_NOTE: { label: "Meeting Note", color: "text-primary", bg: "bg-background border-primary/30", icon: FileText },
  DECISION: { label: "Decision", color: "text-orange", bg: "bg-background border-orange/30", icon: Gavel },
  CLARIFICATION: { label: "Clarification", color: "text-sky-400", bg: "bg-background border-sky-500/30", icon: MessageCircleQuestion },
  DEADLINE: { label: "Roadmap", color: "text-destructive", bg: "bg-background border-destructive/30", icon: CalendarClock },
  SPRINT_DOC: { label: "Sprint Document", color: "text-success", bg: "bg-background border-success/30", icon: IterationCcw },
  SPRINT_PLANNING: { label: "Sprint Planning", color: "text-success", bg: "bg-background border-success/30", icon: IterationCcw },
  SPRINT_REVIEW: { label: "Sprint Review", color: "text-orange", bg: "bg-background border-orange/30", icon: ClipboardCheck },
  FEATURE: { label: "Business Case", color: "text-primary", bg: "bg-background border-primary/30", icon: Sparkles },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bg: "bg-background border-violet-500/30", icon: Wrench },
  BUG: { label: "Bug", color: "text-orange", bg: "bg-background border-orange/30", icon: Bug },
  REPORTED_BUG: { label: "Reported Bug", color: "text-destructive", bg: "bg-background border-destructive/30", icon: AlertCircle },
  DESIGN: { label: "Design", color: "text-cyan-400", bg: "bg-background border-cyan-500/30", icon: Palette },
};

export const ALL_NOTE_TYPES: NoteType[] = [
  "MEETING_NOTE",
  "DECISION",
  "CLARIFICATION",
  "DEADLINE",
  "SPRINT_DOC",
  "SPRINT_PLANNING",
  "SPRINT_REVIEW",
  "FEATURE",
  "ENHANCEMENT",
  "BUG",
  "REPORTED_BUG",
  "DESIGN",
];

// Sprint documents stay in NOTE_TYPE_CONFIG / ALL_NOTE_TYPES so they still
// render, along with the planning and review types documents carried before
// the two became one. New ones are created from the sprint header, not the
// general Notes picker.
export const NOTES_CREATE_TYPES: NoteType[] = [
  "MEETING_NOTE",
  "DECISION",
  "CLARIFICATION",
  "DEADLINE",
];

export function getNoteTypeConfig(noteType?: string | null) {
  if (noteType && noteType in NOTE_TYPE_CONFIG) {
    return NOTE_TYPE_CONFIG[noteType as NoteType];
  }
  return NOTE_TYPE_CONFIG.MEETING_NOTE;
}
