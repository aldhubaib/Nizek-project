import {
  AlertCircle,
  Bug,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Circle,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { priorityLabel, stageLabel, taskTypeLabel } from "@/lib/task-label";
import { cn } from "@/next-ui/lib/cn";

/**
 * The marks a task wears in the new UI: its type as an icon, its priority as a glyph, and the
 * colour of each stage or lane. Names come from `lib/task-label` so both UIs say the same
 * words; the hues are chosen here, because the new theme's `primary` is neutral and would
 * leave Feature and In development without a colour of their own.
 */

const TYPE: Record<string, { icon: LucideIcon; color: string }> = {
  FEATURE: { icon: Sparkles, color: "text-sky" },
  ENHANCEMENT: { icon: Wrench, color: "text-violet" },
  BUG: { icon: Bug, color: "text-destructive" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange" },
  DESIGN: { icon: Palette, color: "text-cyan" },
};

export function taskTypeMark(taskType: string) {
  return TYPE[taskType] ?? TYPE.FEATURE;
}

export function TaskTypeIcon({ taskType, className }: { taskType: string; className?: string }) {
  const mark = taskTypeMark(taskType);
  const Icon = mark.icon;
  return <Icon aria-label={taskTypeLabel(taskType)} className={cn("size-4 shrink-0", mark.color, className)} />;
}

const PRIORITY: Record<string, { icon: LucideIcon; color: string }> = {
  VERY_HIGH: { icon: ChevronsUp, color: "text-destructive" },
  HIGH: { icon: ChevronUp, color: "text-destructive" },
  NORMAL: { icon: Circle, color: "text-success" },
  LOW: { icon: ChevronDown, color: "text-orange" },
  VERY_LOW: { icon: ChevronsDown, color: "text-orange" },
};

/** Rank as a glyph: arrows point away from Normal and double at the extremes; Normal is a ring. */
export function PriorityMark({ priority, className }: { priority: string; className?: string }) {
  const mark = PRIORITY[priority] ?? PRIORITY.NORMAL;
  const Icon = mark.icon;
  const label = `Priority: ${priorityLabel(priority)}`;
  return (
    <span title={label} aria-label={label} className={cn("grid size-5 shrink-0 place-items-center", className)}>
      <Icon aria-hidden strokeWidth={priority === "NORMAL" ? 2 : 2.75} className={cn("size-4", mark.color)} />
    </span>
  );
}

/** The dot colour of a lane or stage header. */
export const LANE_DOT: Record<string, string> = {
  MISSING_DATA: "bg-amber-400",
  BACKLOG: "bg-muted-foreground",
  PLANNED: "bg-violet",
  NEXT: "bg-fuchsia-400",
  TODO: "bg-cyan",
  IN_DEVELOPMENT: "bg-sky",
  INTERNAL_REVIEW: "bg-orange",
  DONE: "bg-emerald-400",
  ACTIVE: "bg-sky",
  COMPLETED: "bg-success",
  PARTIALLY_COMPLETED: "bg-rose-400",
  SHIPPED: "bg-lime-400",
};

export function laneDot(status: string): string {
  return LANE_DOT[status] ?? "bg-muted-foreground";
}

export function LaneDot({ status, className }: { status: string; className?: string }) {
  return <i aria-hidden className={cn("size-2 shrink-0 rounded-full", laneDot(status), className)} />;
}

/** The stage as a small word with its dot; `missing` names the road map's holding pen instead. */
export function StageMark({ stage, missing, className }: { stage: string; missing?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <LaneDot status={missing ? "MISSING_DATA" : stage} />
      {stageLabel(stage, missing)}
    </span>
  );
}

export const SPRINT_STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  NEXT: "Next",
  ACTIVE: "In progress",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partially completed",
  SHIPPED: "Shipped",
};

export function SprintStatusMark({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <LaneDot status={status} />
      {SPRINT_STATUS_LABEL[status] ?? status}
    </span>
  );
}
