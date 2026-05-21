import type { SystemRole } from "@/generated/prisma/client";

type Stage =
  | "NEW_REQUEST"
  | "CLARIFICATION"
  | "READY_FOR_DEV"
  | "IN_DEVELOPMENT"
  | "INTERNAL_REVIEW"
  | "CLIENT_REVIEW"
  | "READY_FOR_RELEASE"
  | "DONE";

/**
 * Which system roles can move a task OUT of each stage.
 * ADMIN always has full access and is not listed explicitly.
 */
const STAGE_OWNERS: Record<Stage, SystemRole[]> = {
  NEW_REQUEST: ["PM"],
  CLARIFICATION: ["PM"],
  READY_FOR_DEV: ["DEVELOPER", "TECH_LEAD", "DESIGNER"],
  IN_DEVELOPMENT: ["DEVELOPER", "TECH_LEAD", "DESIGNER"],
  INTERNAL_REVIEW: ["PM", "TECH_LEAD"],
  CLIENT_REVIEW: ["CLIENT"],
  READY_FOR_RELEASE: ["PM", "TECH_LEAD"],
  DONE: [],
};

/**
 * Which system roles can create tasks (move INTO NEW_REQUEST).
 * Clients can only create REPORTED_BUG tasks.
 */
const TASK_CREATORS: SystemRole[] = ["ADMIN", "PM", "TECH_LEAD"];
const CLIENT_TASK_TYPES = ["REPORTED_BUG"];

export function canMoveFromStage(role: SystemRole, stage: Stage): boolean {
  if (role === "ADMIN") return true;
  return STAGE_OWNERS[stage]?.includes(role) ?? false;
}

export function canCreateTask(role: SystemRole, taskType?: string): boolean {
  if (role === "ADMIN") return true;
  if (role === "CLIENT") {
    return taskType ? CLIENT_TASK_TYPES.includes(taskType) : true;
  }
  return TASK_CREATORS.includes(role);
}

export function canModifyTask(role: SystemRole): boolean {
  return role === "ADMIN" || role === "PM" || role === "TECH_LEAD";
}

export function canDeleteTask(role: SystemRole): boolean {
  return role === "ADMIN" || role === "PM";
}

export function canManageTeam(role: SystemRole): boolean {
  return role === "ADMIN";
}

export function canAccessSettings(role: SystemRole): boolean {
  return role === "ADMIN" || role === "PM";
}

export function getMovableStages(role: SystemRole): Stage[] {
  if (role === "ADMIN") {
    return Object.keys(STAGE_OWNERS) as Stage[];
  }
  return (Object.entries(STAGE_OWNERS) as [Stage, SystemRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([stage]) => stage);
}

export const SYSTEM_ROLE_CONFIG: Record<
  SystemRole,
  { label: string; color: string; bg: string }
> = {
  ADMIN: {
    label: "Admin",
    color: "text-purple-400",
    bg: "bg-purple-500/15 border-purple-500/30",
  },
  PM: {
    label: "PM",
    color: "text-blue-400",
    bg: "bg-blue-500/15 border-blue-500/30",
  },
  TECH_LEAD: {
    label: "Tech Lead",
    color: "text-amber-400",
    bg: "bg-amber-500/15 border-amber-500/30",
  },
  DEVELOPER: {
    label: "Developer",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15 border-emerald-500/30",
  },
  DESIGNER: {
    label: "Designer",
    color: "text-pink-400",
    bg: "bg-pink-500/15 border-pink-500/30",
  },
  CLIENT: {
    label: "Client",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15 border-cyan-500/30",
  },
};
