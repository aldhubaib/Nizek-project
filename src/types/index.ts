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

// Task type labels and colours live in task-label and task-type-style. Two
// unused maps sat here holding a third opinion, red for a bug where the rest of
// the product had orange, and were removed rather than corrected.

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  MEMBER: "Member",
  CLIENT: "Client",
};
