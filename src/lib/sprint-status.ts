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
