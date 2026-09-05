import {
  AlertCircle,
  Bug,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { taskTypeColor, taskTypeLabel } from "@/lib/task-label";

/** Declaration order is the order the pickers offer them in. */
export const TASK_TYPES = [
  "FEATURE",
  "ENHANCEMENT",
  "BUG",
  "REPORTED_BUG",
  "DESIGN",
] as const;

export type TaskTypeId = (typeof TASK_TYPES)[number];

/**
 * The mark for each task type, and the only place any of them is chosen. Lives
 * apart from the colours in task-label so that server code can read a type's
 * colour without pulling an icon set in behind it.
 */
export const TASK_TYPE_ICON: Record<string, LucideIcon> = {
  FEATURE: Sparkles,
  ENHANCEMENT: Wrench,
  BUG: Bug,
  REPORTED_BUG: AlertCircle,
  DESIGN: Palette,
};

export function taskTypeIcon(taskType: string): LucideIcon {
  return TASK_TYPE_ICON[taskType] ?? TASK_TYPE_ICON.FEATURE;
}

/** Everything a type looks like: its mark, its name, and its colours. */
export function taskTypeStyle(taskType: string) {
  return {
    icon: taskTypeIcon(taskType),
    label: taskTypeLabel(taskType),
    ...taskTypeColor(taskType),
  };
}
