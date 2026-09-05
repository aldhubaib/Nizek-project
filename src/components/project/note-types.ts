import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gavel,
  IterationCcw,
  MessageCircleQuestion,
} from "lucide-react";
import { taskTypeStyle } from "@/lib/task-type-style";

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

function taskTypeEntry(taskType: string, label: string) {
  const style = taskTypeStyle(taskType);
  return {
    label,
    color: style.text,
    bg: `bg-background ${style.border}`,
    icon: style.icon,
  };
}

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
  // A note about a task wears that task's colour, from the one registry.
  FEATURE: taskTypeEntry("FEATURE", "Business Case"),
  ENHANCEMENT: taskTypeEntry("ENHANCEMENT", "Enhancement"),
  BUG: taskTypeEntry("BUG", "Bug"),
  REPORTED_BUG: taskTypeEntry("REPORTED_BUG", "Reported Bug"),
  DESIGN: taskTypeEntry("DESIGN", "Design"),
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
