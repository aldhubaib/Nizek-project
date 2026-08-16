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

export const ROADMAP_NEXT_MAX = 3;
export const ROADMAP_NEXT_FULL_ERROR = "You can drag this item max number is 3";

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

function hasEffort(workingDays: number | null | undefined): boolean {
  return (
    workingDays != null &&
    Number.isInteger(Number(workingDays)) &&
    Number(workingDays) >= 1
  );
}

/**
 * Planned / Next can be empty.
 * In Progress needs Efforts (due date is set on the drag).
 * Shipped needs Efforts and a due date (set when it entered In Progress).
 */
export function roadmapScheduleError(
  status: RoadmapStatus,
  dueDate: Date | string | null | undefined,
  workingDays: number | null | undefined,
): string | null {
  if (status === "PLANNED" || status === "NEXT") return null;
  if (!hasEffort(workingDays)) {
    return "Please enter the Efforts before moving to In Progress.";
  }
  if (status === "SHIPPED" && !dueDate) {
    return "Move this to In Progress first so a due date can be set.";
  }
  return null;
}

/** `nextCount` is how many items are already in Next, excluding the card being moved. */
export function roadmapNextColumnError(nextCount: number): string | null {
  if (nextCount >= ROADMAP_NEXT_MAX) return ROADMAP_NEXT_FULL_ERROR;
  return null;
}
