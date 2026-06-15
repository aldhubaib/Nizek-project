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

export const STAGE_ORDER: Stage[] = [
  "NEW_REQUEST",
  "CLARIFICATION",
  "READY_FOR_DEV",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "READY_FOR_RELEASE",
  "DONE",
];

export const STAGE_LABELS: Record<Stage, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; color: string; bg: string }> = {
  FEATURE: { label: "Business Case", color: "text-primary", bg: "bg-primary/15 border-primary/20" },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bg: "bg-violet-500/15 border-violet-500/20" },
  BUG: { label: "Bug", color: "text-destructive", bg: "bg-destructive/15 border-destructive/20" },
  REPORTED_BUG: { label: "Reported Bug", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20" },
  DESIGN: { label: "Design", color: "text-cyan-400", bg: "bg-cyan-500/15 border-cyan-500/20" },
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  MEMBER: "Member",
  CLIENT: "Client",
};
