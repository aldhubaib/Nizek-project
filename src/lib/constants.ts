import type { Stage } from "@/generated/prisma/client";

export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "BACKLOG", label: "Backlog", color: "bg-muted-foreground" },
  { id: "CLARIFICATION", label: "Clarification", color: "bg-violet-500" },
  { id: "IN_DEVELOPMENT", label: "In Development", color: "bg-sky-500" },
  { id: "INTERNAL_REVIEW", label: "Internal Review", color: "bg-orange" },
  { id: "CLIENT_REVIEW", label: "Client Review", color: "bg-orange-500" },
  { id: "DONE", label: "Done", color: "bg-success" },
];

export const TASK_TYPE_META: Record<
  string,
  { prefix: string; label: string; color: string }
> = {
  FEATURE: { prefix: "F", label: "Business Case", color: "text-primary" },
  ENHANCEMENT: { prefix: "E", label: "Enhancement", color: "text-violet-400" },
  BUG: { prefix: "B", label: "Internal Bug", color: "text-orange" },
  REPORTED_BUG: { prefix: "RB", label: "Reported Bug", color: "text-destructive" },
  DESIGN: { prefix: "D", label: "Design", color: "text-cyan-400" },
};
