"use client";

import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_BADGE,
  type TaskPriorityId,
} from "@/lib/task-label";

/** Filled state per level; unselected levels share the muted outline. */
const SELECTED_CLASS: Record<TaskPriorityId, string> = {
  VERY_LOW: "bg-muted-foreground/20 border-muted-foreground/40 text-foreground",
  LOW: "bg-cyan/20 border-cyan/40 text-cyan",
  NORMAL: "bg-primary/20 border-primary/40 text-primary",
  HIGH: "bg-orange/20 border-orange/40 text-orange",
  VERY_HIGH: "bg-destructive/20 border-destructive/40 text-destructive",
};

/**
 * The five priority levels, lowest to highest. There is no empty state — a
 * task always carries a priority, and Normal is where every one of them starts.
 */
export function PriorityPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TaskPriorityId;
  onChange: (next: TaskPriorityId) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-xs", className)}>
      {TASK_PRIORITIES.map((id) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "h-9 rounded-md border px-3 text-s font-medium transition-colors disabled:opacity-50",
            value === id
              ? SELECTED_CLASS[id]
              : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
          )}
        >
          {TASK_PRIORITY_BADGE[id].label}
        </button>
      ))}
    </div>
  );
}
