import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gavel,
  IterationCcw,
  MessageCircleQuestion,
  MinusCircle,
  PlusCircle,
  type LucideIcon,
} from "lucide-react";
import type { ActivityCardTheme } from "@/components/messages/activity-card";
import { TASK_TYPES, taskTypeStyle } from "@/lib/task-type-style";

export const PRIMARY_ACTIVITY_THEME: ActivityCardTheme = {
  accent: "text-primary",
  border: "border-primary/30",
  ring: "ring-primary/15",
  iconWrap: "bg-primary/10 text-primary",
  button: "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary",
  quote: "border-primary/60",
};

/**
 * Icon and colour per note and task type, shared by every activity card so a
 * bug looks like a bug whether it arrived as a note announcement or as an
 * issue a client raised.
 */
export const ACTIVITY_THEME: Record<
  string,
  { icon: LucideIcon; theme: ActivityCardTheme }
> = {
  MEETING_NOTE: { icon: FileText, theme: PRIMARY_ACTIVITY_THEME },
  DECISION: {
    icon: Gavel,
    theme: {
      accent: "text-orange",
      border: "border-orange/35",
      ring: "ring-orange/20",
      iconWrap: "bg-orange/10 text-orange",
      button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
      pill: "border-orange/30 text-orange",
      quote: "border-orange/60",
    },
  },
  CLARIFICATION: {
    icon: MessageCircleQuestion,
    theme: {
      accent: "text-sky",
      border: "border-sky/35",
      ring: "ring-sky/20",
      iconWrap: "bg-sky/10 text-sky",
      button: "border-sky/30 bg-sky/5 hover:bg-sky/10 text-sky",
      pill: "border-sky/30 text-sky",
      quote: "border-sky/60",
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
      pill: "border-destructive/30 text-destructive",
      quote: "border-destructive/60",
    },
  },
  SPRINT_PLANNING: {
    icon: IterationCcw,
    theme: {
      accent: "text-success",
      border: "border-success/35",
      ring: "ring-success/20",
      iconWrap: "bg-success/10 text-success",
      button: "border-success/30 bg-success/5 hover:bg-success/10 text-success",
      pill: "border-success/30 text-success",
      quote: "border-success/60",
    },
  },
  SPRINT_REVIEW: {
    icon: ClipboardCheck,
    theme: {
      accent: "text-orange",
      border: "border-orange/35",
      ring: "ring-orange/20",
      iconWrap: "bg-orange/10 text-orange",
      button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
      pill: "border-orange/30 text-orange",
      quote: "border-orange/60",
    },
  },
  // Scope changes read against the sprint cards on purpose: green opens a
  // sprint and orange closes it, so the two ways its scope can move while it
  // runs are a colour the sprint itself never uses.
  SPRINT_TASK_ADDED: {
    icon: PlusCircle,
    theme: {
      accent: "text-violet",
      border: "border-violet/35",
      ring: "ring-violet/20",
      iconWrap: "bg-violet/10 text-violet",
      button: "border-violet/30 bg-violet/5 hover:bg-violet/10 text-violet",
      pill: "border-violet/30 text-violet",
      quote: "border-violet/60",
    },
  },
  SPRINT_TASK_REMOVED: {
    icon: MinusCircle,
    theme: {
      accent: "text-destructive",
      border: "border-destructive/35",
      ring: "ring-destructive/20",
      iconWrap: "bg-destructive/10 text-destructive",
      button: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive",
      pill: "border-destructive/30 text-destructive",
      quote: "border-destructive/60",
    },
  },
  // The task types come from the one registry rather than being restated here,
  // so a bug in chat is the colour of the bug it links to.
  ...Object.fromEntries(
    TASK_TYPES.map((type) => {
      const style = taskTypeStyle(type);
      return [type, { icon: style.icon, theme: style.activity }];
    }),
  ),
};

export function activityTheme(key: string) {
  return ACTIVITY_THEME[key] ?? { icon: FileText, theme: PRIMARY_ACTIVITY_THEME };
}
