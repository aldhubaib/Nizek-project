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
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/next-ui/lib/cn";

/** Every kind of note the live panel writes, by the word it shows for it and its mark. */
export const NOTE_TYPES: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  MEETING_NOTE: { label: "Meeting note", icon: FileText, color: "text-sky" },
  DECISION: { label: "Decision", icon: Gavel, color: "text-orange" },
  CLARIFICATION: { label: "Clarification", icon: MessageCircleQuestion, color: "text-cyan" },
  DEADLINE: { label: "Roadmap", icon: CalendarClock, color: "text-destructive" },
  SPRINT_DOC: { label: "Sprint document", icon: IterationCcw, color: "text-success" },
  SPRINT_PLANNING: { label: "Sprint planning", icon: IterationCcw, color: "text-success" },
  SPRINT_REVIEW: { label: "Sprint review", icon: ClipboardCheck, color: "text-orange" },
  FEATURE: { label: "Business case", icon: Sparkles, color: "text-sky" },
  ENHANCEMENT: { label: "Enhancement", icon: Wrench, color: "text-violet" },
  BUG: { label: "Bug", icon: Bug, color: "text-destructive" },
  REPORTED_BUG: { label: "Reported bug", icon: AlertCircle, color: "text-orange" },
  DESIGN: { label: "Design", icon: Palette, color: "text-cyan" },
};

export function noteType(type: string) {
  return NOTE_TYPES[type] ?? NOTE_TYPES.MEETING_NOTE;
}

export function noteTypeLabel(type: string): string {
  return noteType(type).label;
}

/** The note's kind as a tinted square with its icon, the leading mark of a note row. */
export function NoteTypeIcon({ type, className }: { type: string; className?: string }) {
  const cfg = noteType(type);
  const Icon = cfg.icon;
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-muted", cfg.color, className)} aria-label={cfg.label}>
      <Icon className="size-5" />
    </span>
  );
}
