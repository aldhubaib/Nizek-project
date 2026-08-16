export const ROADMAP_STATUSES = ["PLANNED", "NEXT", "PROGRESS", "SHIPPED"] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const ROADMAP_COLUMNS: {
  id: RoadmapStatus;
  label: string;
}[] = [
  { id: "PLANNED", label: "Planned" },
  { id: "NEXT", label: "Next" },
  { id: "PROGRESS", label: "In Progress" },
  { id: "SHIPPED", label: "Shipped" },
];

const LABELS: Record<RoadmapStatus, string> = {
  PLANNED: "Planned",
  NEXT: "Next",
  PROGRESS: "In Progress",
  SHIPPED: "Shipped",
};

export function isRoadmapStatus(value: string): value is RoadmapStatus {
  return (ROADMAP_STATUSES as readonly string[]).includes(value);
}

export function normalizeRoadmapStatus(
  value: string | null | undefined,
  completedAt?: Date | string | null,
): RoadmapStatus {
  if (value && isRoadmapStatus(value)) return value;
  return completedAt ? "SHIPPED" : "PLANNED";
}

export function roadmapStatusLabel(status: string | null | undefined): string {
  if (status && isRoadmapStatus(status)) return LABELS[status];
  return LABELS.PLANNED;
}

/** Tasks can be created from a roadmap item once work has started. */
export function roadmapAllowsCreateTask(status: RoadmapStatus): boolean {
  return status === "PROGRESS" || status === "SHIPPED";
}

export function roadmapCreateTaskError(status: RoadmapStatus): string | null {
  if (roadmapAllowsCreateTask(status)) return null;
  return "Move this to In Progress before creating a task.";
}

/** Planned can be empty; Next / In Progress / Shipped need due date + effort. */
export function roadmapScheduleError(
  status: RoadmapStatus,
  dueDate: Date | string | null | undefined,
  workingDays: number | null | undefined,
): string | null {
  if (status === "PLANNED") return null;
  const needDate = !dueDate;
  const needEffort =
    workingDays == null ||
    (typeof workingDays === "number" && !Number.isInteger(workingDays)) ||
    Number(workingDays) < 1;
  if (!needDate && !needEffort) return null;
  if (needDate && needEffort) {
    return "Add a due date and working days before moving this to Next.";
  }
  if (needDate) return "Add a due date before moving this to Next.";
  return "Add working days before moving this to Next.";
}

