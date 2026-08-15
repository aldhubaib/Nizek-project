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
