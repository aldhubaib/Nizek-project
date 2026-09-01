export function taskTypePrefix(taskType: string): string {
  switch (taskType) {
    case "BUG":
      return "B";
    case "REPORTED_BUG":
      return "RB";
    case "ENHANCEMENT":
      return "E";
    case "DESIGN":
      return "D";
    default:
      return "F";
  }
}

export function taskCode(taskType: string, taskNumber: number): string {
  return `${taskTypePrefix(taskType)}-${String(taskNumber).padStart(3, "0")}`;
}

/** Transparent outline chip — the project-page badge look. */
export function outlineBadge(label: string, color: string, border: string) {
  return { label, color, bg: `bg-transparent ${border}` };
}

export const TASK_TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  FEATURE: outlineBadge("Business Case", "text-primary", "border-primary/30"),
  ENHANCEMENT: outlineBadge("Enhancement", "text-violet", "border-violet/30"),
  BUG: outlineBadge("Bug", "text-orange", "border-orange/30"),
  REPORTED_BUG: outlineBadge("Reported Bug", "text-destructive", "border-destructive/30"),
  DESIGN: outlineBadge("Design", "text-cyan", "border-cyan/30"),
};

// Declaration order is the lifecycle order, and the history view relies on it to
// lay stages out left to right.
export const TASK_STAGE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  BACKLOG: outlineBadge("Backlog", "text-muted-foreground", "border-muted-foreground/30"),
  PLANNED: outlineBadge("Planned", "text-violet-400", "border-violet-500/30"),
  NEXT: outlineBadge("Next", "text-cyan", "border-cyan/30"),
  TODO: outlineBadge("Todo", "text-cyan-400", "border-cyan-500/30"),
  IN_DEVELOPMENT: outlineBadge("In Development", "text-sky-400", "border-sky-500/30"),
  INTERNAL_REVIEW: outlineBadge("Internal Review", "text-orange", "border-orange/30"),
  DONE: outlineBadge("Done", "text-success", "border-success/30"),
  COMPLETED: outlineBadge("Completed", "text-emerald-400", "border-emerald-500/30"),
  SHIPPED: outlineBadge("Shipped", "text-success", "border-success/30"),
};

export const TASK_STAGE_DOT: Record<string, string> = {
  BACKLOG: "bg-muted-foreground",
  PLANNED: "bg-violet-400",
  NEXT: "bg-cyan",
  TODO: "bg-cyan-400",
  IN_DEVELOPMENT: "bg-sky-400",
  INTERNAL_REVIEW: "bg-orange",
  DONE: "bg-success",
  COMPLETED: "bg-emerald-400",
  SHIPPED: "bg-success",
};

export function taskStageBadge(stage: string, missingData = false) {
  if (missingData) {
    return outlineBadge("Missing data", "text-orange", "border-orange/30");
  }
  return (
    TASK_STAGE_BADGE[stage] ??
    outlineBadge(stage, "text-muted-foreground", "border-muted-foreground/30")
  );
}

export function stageLabel(stage: string | null | undefined, missingData = false): string {
  if (!stage) return "—";
  return taskStageBadge(stage, missingData).label;
}

/** Lowest to highest. Order is the ranking, and the pickers render it as-is. */
export const TASK_PRIORITIES = [
  "VERY_LOW",
  "LOW",
  "NORMAL",
  "HIGH",
  "VERY_HIGH",
] as const;

export type TaskPriorityId = (typeof TASK_PRIORITIES)[number];

/** Every task starts here — there is no "unset" priority. */
export const DEFAULT_TASK_PRIORITY: TaskPriorityId = "NORMAL";

export const TASK_PRIORITY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  VERY_LOW: outlineBadge("Very Low", "text-muted-foreground", "border-muted-foreground/30"),
  LOW: outlineBadge("Low", "text-cyan", "border-cyan/30"),
  NORMAL: outlineBadge("Normal", "text-primary", "border-primary/30"),
  HIGH: outlineBadge("High", "text-orange", "border-orange/30"),
  VERY_HIGH: outlineBadge("Very High", "text-destructive", "border-destructive/30"),
};

export function isTaskPriority(value: unknown): value is TaskPriorityId {
  return (
    typeof value === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

export function taskPriorityBadge(priority: string | null | undefined) {
  if (!priority) return TASK_PRIORITY_BADGE[DEFAULT_TASK_PRIORITY];
  return (
    TASK_PRIORITY_BADGE[priority] ??
    outlineBadge(priority, "text-muted-foreground", "border-muted-foreground/30")
  );
}

/**
 * Task history predates the named levels, so old rows hold "7" and the like.
 * Those stay as written rather than being reinterpreted after the fact.
 */
export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  return TASK_PRIORITY_BADGE[priority]?.label ?? priority;
}

export const SPRINT_STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PLANNED: outlineBadge("Planned", "text-muted-foreground", "border-muted-foreground/30"),
  NEXT: outlineBadge("Next", "text-cyan", "border-cyan/30"),
  ACTIVE: outlineBadge("In progress", "text-success", "border-success/30"),
  COMPLETED: outlineBadge("Completed", "text-success", "border-success/30"),
  PARTIALLY_COMPLETED: outlineBadge("Partially completed", "text-orange", "border-orange/30"),
  SHIPPED: outlineBadge("Shipped", "text-success", "border-success/30"),
};

export function sprintStatusBadge(status: string) {
  return (
    SPRINT_STATUS_BADGE[status] ??
    outlineBadge(status, "text-muted-foreground", "border-border")
  );
}

export function sprintTabForStatus(status: string): "sprints" | "roadmap" {
  if (status === "ACTIVE") return "sprints";
  return "roadmap";
}

export function normalizeProjectTab(tab: string | null | undefined): string {
  if (!tab || tab === "board" || tab === "completed") return "roadmap";
  return tab;
}

export function isProjectReturnTab(
  value: string | null | undefined,
): value is "board" | "sprints" | "roadmap" | "completed" {
  return (
    value === "board" ||
    value === "sprints" ||
    value === "roadmap" ||
    value === "completed"
  );
}

/** Task details URL, carrying the project tab to return to. */
export function taskDetailHref(
  projectId: string,
  taskId: string,
  from?: string | null,
): string {
  const base = `/dashboard/projects/${projectId}/tasks/${taskId}`;
  if (isProjectReturnTab(from)) return `${base}?from=${from}`;
  return base;
}

/** Project page to return to from task details. */
export function projectHrefForTaskReturn(
  projectId: string,
  from?: string | null,
  sprintStatus?: string | null,
): string {
  const tab = isProjectReturnTab(from)
    ? from === "completed" || from === "board"
      ? "roadmap"
      : from
    : sprintStatus
      ? sprintTabForStatus(sprintStatus)
      : "roadmap";
  if (tab === "roadmap") return `/dashboard/projects/${projectId}`;
  return `/dashboard/projects/${projectId}?tab=${tab}`;
}

