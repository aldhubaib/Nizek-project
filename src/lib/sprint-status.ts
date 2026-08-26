export const SPRINT_BOARD_COLUMNS = [
  { id: "PLANNED", label: "Planned" },
  { id: "NEXT", label: "Next" },
  { id: "ACTIVE", label: "In Progress" },
  { id: "COMPLETED", label: "Completed" },
  { id: "SHIPPED", label: "Shipped" },
] as const;

export type SprintBoardColumn = (typeof SPRINT_BOARD_COLUMNS)[number]["id"];

export function isClosedSprint(status: string): boolean {
  return status === "COMPLETED" || status === "PARTIALLY_COMPLETED" || status === "SHIPPED";
}

export function isUnstartedSprint(status: string): boolean {
  return status === "PLANNED" || status === "NEXT";
}

export function sprintBoardColumn(status: string): SprintBoardColumn {
  if (status === "NEXT") return "NEXT";
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "COMPLETED" || status === "PARTIALLY_COMPLETED") return "COMPLETED";
  if (status === "SHIPPED") return "SHIPPED";
  return "PLANNED";
}

/** Still counts toward the task’s current-sprint tally. */
export function isCurrentSprintStatus(status: string): boolean {
  return status === "PLANNED" || status === "NEXT" || status === "ACTIVE";
}

export function comparePlannedSprints(
  a: { sortOrder: number; status: string; startDate: string | Date },
  b: { sortOrder: number; status: string; startDate: string | Date },
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const nextFirst = Number(b.status === "NEXT") - Number(a.status === "NEXT");
  if (nextFirst !== 0) return nextFirst;
  return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
}

function closedAtMs(sprint: {
  completedAt: string | Date | null;
  updatedAt: string | Date;
}): number {
  return new Date(sprint.completedAt ?? sprint.updatedAt).getTime();
}

/** Newest sprint-review completion first (`completedAt` is set when the review ends the sprint). */
export function compareClosedSprints(
  a: { completedAt: string | Date | null; updatedAt: string | Date },
  b: { completedAt: string | Date | null; updatedAt: string | Date },
): number {
  return closedAtMs(b) - closedAtMs(a);
}
