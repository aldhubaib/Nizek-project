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

export const TASK_STAGE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  NEW_REQUEST: outlineBadge("Backlog", "text-muted-foreground", "border-muted-foreground/30"),
  BACKLOG: outlineBadge("Backlog", "text-muted-foreground", "border-muted-foreground/30"),
  CLARIFICATION: outlineBadge("Clarification", "text-violet-400", "border-violet-500/30"),
  READY_FOR_DEV: outlineBadge("Todo", "text-cyan-400", "border-cyan-500/30"),
  IN_DEVELOPMENT: outlineBadge("In Development", "text-sky-400", "border-sky-500/30"),
  INTERNAL_REVIEW: outlineBadge("Internal Review", "text-orange", "border-orange/30"),
  CLIENT_REVIEW: outlineBadge("Client Review", "text-orange-400", "border-orange-500/30"),
  READY_FOR_RELEASE: outlineBadge("Ready for Release", "text-emerald-400", "border-emerald-500/30"),
  DONE: outlineBadge("Done", "text-success", "border-success/30"),
};

export const TASK_STAGE_DOT: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground",
  BACKLOG: "bg-muted-foreground",
  CLARIFICATION: "bg-violet-400",
  READY_FOR_DEV: "bg-cyan-400",
  IN_DEVELOPMENT: "bg-sky-400",
  INTERNAL_REVIEW: "bg-orange",
  CLIENT_REVIEW: "bg-orange-400",
  READY_FOR_RELEASE: "bg-emerald-400",
  DONE: "bg-success",
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

export function sprintTabForStatus(status: string): "board" | "sprints" | "completed" {
  if (status === "ACTIVE") return "sprints";
  if (
    status === "COMPLETED" ||
    status === "PARTIALLY_COMPLETED" ||
    status === "SHIPPED" ||
    status === "NEXT"
  ) {
    return "completed";
  }
  return "board";
}

export function isProjectReturnTab(
  value: string | null | undefined,
): value is "board" | "sprints" | "completed" {
  return value === "board" || value === "sprints" || value === "completed";
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
    ? from
    : sprintStatus
      ? sprintTabForStatus(sprintStatus)
      : "board";
  if (tab === "board") return `/dashboard/projects/${projectId}`;
  return `/dashboard/projects/${projectId}?tab=${tab}`;
}

