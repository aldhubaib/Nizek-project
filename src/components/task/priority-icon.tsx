import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { TASK_PRIORITY_BADGE, type TaskPriorityId } from "@/lib/task-label";
import { cn } from "@/lib/utils";

/**
 * Rank as a glyph. Arrows point away from Normal and double up at the extremes,
 * so the direction carries the meaning and the colour only reinforces it —
 * readable for anyone who cannot separate the red from the orange.
 *
 * Normal is a hollow ring rather than an arrow because it is the resting state,
 * not a nudge either way.
 */
const PRIORITY_ICON: Record<TaskPriorityId, { icon: LucideIcon; color: string }> = {
  VERY_HIGH: { icon: ChevronsUp, color: "text-destructive" },
  HIGH: { icon: ChevronUp, color: "text-destructive" },
  NORMAL: { icon: Circle, color: "text-success" },
  LOW: { icon: ChevronDown, color: "text-orange" },
  VERY_LOW: { icon: ChevronsDown, color: "text-orange" },
};

/**
 * The bare glyph. Marked aria-hidden: every caller either sits beside the
 * written level or wraps this in a labelled element, so announcing it here
 * would only repeat what the row already says.
 */
export function PriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriorityId;
  className?: string;
}) {
  const cfg = PRIORITY_ICON[priority];
  const Icon = cfg.icon;
  return (
    <Icon
      aria-hidden
      // The ring reads heavy next to the chevrons at a matched weight.
      strokeWidth={priority === "NORMAL" ? 2 : 2.75}
      className={cn("size-4 shrink-0", cfg.color, className)}
    />
  );
}

/** Icon-only priority, for rows with no space to spell the level out. */
export function PriorityIconBadge({
  priority,
  className,
}: {
  priority: TaskPriorityId;
  className?: string;
}) {
  const label = `Priority: ${TASK_PRIORITY_BADGE[priority].label}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("grid size-6 shrink-0 place-items-center", className)}
    >
      <PriorityIcon priority={priority} />
    </span>
  );
}
