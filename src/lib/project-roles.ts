import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Everything a role carries besides its identity: copied verbatim from a
 * preset onto a project, and the shape the managers edit.
 */
export type RoleDefinition = {
  name: string;
  description: string | null;
  isAdmin: boolean;
  isClient: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  isTeamLead: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  canDeleteSprint: boolean;
  canViewTaskHistory: boolean;
  allowedStages: string | null;
  allowedTransitions: string | null;
};

/**
 * What a project gets when no preset is marked Admin. Every project needs one
 * role its admins can hold, so this stands in rather than leaving the project
 * unmanageable.
 */
export const BUILT_IN_ADMIN_ROLE: RoleDefinition = {
  name: "Admin",
  description: "Full access to this project.",
  isAdmin: true,
  isClient: false,
  canCreateTask: true,
  canModifyTask: true,
  canMoveTask: true,
  canDeleteTask: true,
  canDeclineTask: true,
  isTeamLead: true,
  canCreateSprintPlanning: true,
  canStartSprint: true,
  canEndSprint: true,
  canDeleteSprint: true,
  canViewTaskHistory: true,
  allowedStages: null,
  allowedTransitions: null,
};

/**
 * The row to insert when copying `preset` onto `projectId`. Same name, same
 * flags, same stage rules; only the owner changes, and `presetId` remembers
 * where it came from. `createdAt` is carried over so the project's roles keep
 * the order people know from the preset list.
 */
export function roleCopyData(
  preset: RoleDefinition & { id?: string; createdAt?: Date },
  projectId: string,
) {
  return {
    projectId,
    presetId: preset.id ?? null,
    name: preset.name,
    description: preset.description,
    isAdmin: preset.isAdmin,
    isClient: preset.isClient,
    canCreateTask: preset.canCreateTask,
    canModifyTask: preset.canModifyTask,
    canMoveTask: preset.canMoveTask,
    canDeleteTask: preset.canDeleteTask,
    canDeclineTask: preset.canDeclineTask,
    isTeamLead: preset.isTeamLead,
    canCreateSprintPlanning: preset.canCreateSprintPlanning,
    canStartSprint: preset.canStartSprint,
    canEndSprint: preset.canEndSprint,
    canDeleteSprint: preset.canDeleteSprint,
    canViewTaskHistory: preset.canViewTaskHistory,
    allowedStages: preset.allowedStages,
    allowedTransitions: preset.allowedTransitions,
    ...(preset.createdAt ? { createdAt: preset.createdAt } : {}),
  };
}

/**
 * Who may add, change and remove a project's roles: a system admin, or a
 * member holding the project's Admin role. The membership enum is checked
 * too so a member whose role row was removed but who is still marked ADMIN
 * is not locked out. Presets (no project) are a system-admin matter and do
 * not come through here.
 */
export function canManageProjectRoles(
  user: { systemRole: string },
  member: { role: string; projectRole: { isAdmin: boolean } | null } | null,
): boolean {
  if (user.systemRole === "ADMIN") return true;
  if (!member) return false;
  return Boolean(member.projectRole?.isAdmin) || member.role === "ADMIN";
}

/**
 * Give a project its own copy of every preset. Used when a project is created
 * and as a safety net for a project found with no roles at all. Guarantees an
 * Admin role exists so the project can be managed. Returns the created rows.
 */
export async function seedProjectRoles(db: Db, projectId: string) {
  const presets = await db.projectRole.findMany({
    where: { projectId: null },
    orderBy: { createdAt: "asc" },
  });

  const definitions: (RoleDefinition & { id?: string; createdAt?: Date })[] = presets.some(
    (p) => p.isAdmin,
  )
    ? presets
    : [BUILT_IN_ADMIN_ROLE, ...presets.filter((p) => p.name !== BUILT_IN_ADMIN_ROLE.name)];

  const created = [];
  for (const def of definitions) {
    created.push(await db.projectRole.create({ data: roleCopyData(def, projectId) }));
  }
  return created;
}
