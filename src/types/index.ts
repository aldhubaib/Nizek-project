export type {
  User,
  Project,
  ProjectMember,
  ProjectRole,
  Contract,
  Task,
  MeetingNote,
  Asset,
  Invitation,
} from "@/generated/prisma/client";

export {
  Role,
  Stage,
  TaskType,
  InvitationStatus,
} from "@/generated/prisma/client";

import type {
  User,
  ProjectMember,
  Project,
  Contract,
  Task,
} from "@/generated/prisma/client";

import { type Stage, type Role, type TaskType } from "@/generated/prisma/client";

export type ProjectWithMembers = Project & {
  members: (ProjectMember & { user: User })[];
};

export type ProjectWithContracts = Project & {
  contracts: Contract[];
};

export type ProjectWithDetails = Project & {
  contracts: Contract[];
  tasks: Task[];
  _count: {
    tasks: number;
    meetingNotes: number;
    assets: number;
  };
};

export type TaskWithAssignee = Task & {
  assignee: User | null;
  createdBy: User;
};

export function isProjectActive(project: ProjectWithContracts): boolean {
  const now = new Date();
  return project.contracts.some((c) => {
    if (!c.startDate || !c.endDate) return false;
    const end = new Date(c.endDate);
    end.setHours(23, 59, 59, 999);
    return new Date(c.startDate) <= now && end >= now;
  });
}

export { STAGE_ORDER } from "@/lib/task-stage";

export const STAGE_LABELS: Record<Stage, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  NEXT: "Next",
  TODO: "Todo",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  DONE: "Done",
  COMPLETED: "Completed",
  SHIPPED: "Shipped",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; color: string; bg: string }> = {
  FEATURE: { label: "Business Case", color: "text-primary", bg: "bg-transparent border-primary/30" },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bg: "bg-transparent border-violet-500/30" },
  BUG: { label: "Bug", color: "text-destructive", bg: "bg-transparent border-destructive/30" },
  REPORTED_BUG: { label: "Reported Bug", color: "text-amber-400", bg: "bg-transparent border-amber-500/30" },
  DESIGN: { label: "Design", color: "text-cyan-400", bg: "bg-transparent border-cyan-500/30" },
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  MEMBER: "Member",
  CLIENT: "Client",
};
