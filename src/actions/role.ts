"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { clientRoleWriteData } from "@/lib/client-role";
import { canManageProjectRoles, seedProjectRoles } from "@/lib/project-roles";

/**
 * Which list of roles an action works on: one project's own roles, or, with
 * `null`, the presets a new project starts with.
 */
type RoleScope = string | null;

async function requireRoleManagement(projectId: RoleScope) {
  if (projectId === null) {
    const user = await requireUser();
    if (user.systemRole !== "ADMIN") throw new Error("Only admins can manage role presets");
    return user;
  }
  const { user, member } = await requireProjectMember(projectId);
  if (!canManageProjectRoles(user, member)) {
    throw new Error("Only project admins can manage roles");
  }
  return user;
}

function revalidateRoles(projectId: RoleScope) {
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/team");
}

/**
 * Every scope has a chat-only Client role: found by flag, else an existing
 * role named Client is flipped to chat-only, else one is created.
 */
async function ensureClientRole(projectId: RoleScope) {
  const byFlag = await prisma.projectRole.findFirst({ where: { projectId, isClient: true } });
  if (byFlag) return byFlag;

  const byName = await prisma.projectRole.findFirst({
    where: { projectId, name: { equals: "Client", mode: "insensitive" } },
  });
  if (byName) {
    return prisma.projectRole.update({
      where: { id: byName.id },
      data: clientRoleWriteData(true),
    });
  }

  return prisma.projectRole.create({
    data: {
      projectId,
      name: "Client",
      description: "Can only access this project's client chat.",
      ...clientRoleWriteData(true),
    },
  });
}

/**
 * A project's roles (any member may read them), or the presets (`null`,
 * system admins only). A project found with no roles at all gets the presets
 * copied in first, so it is never left unmanageable.
 */
export async function getRoles(projectId: RoleScope = null) {
  if (projectId === null) {
    const user = await requireUser();
    if (user.systemRole !== "ADMIN") throw new Error("Only admins can view role presets");
  } else {
    await requireProjectMember(projectId);
    const count = await prisma.projectRole.count({ where: { projectId } });
    if (count === 0) await prisma.$transaction((tx) => seedProjectRoles(tx, projectId));
  }

  await ensureClientRole(projectId);
  return prisma.projectRole.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function createRole(data: {
  projectId: RoleScope;
  name: string;
  description?: string;
  isAdmin?: boolean;
  isClient?: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  isTeamLead?: boolean;
  canCreateSprintPlanning?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canDeleteSprint?: boolean;
  canViewTaskHistory?: boolean;
  allowedTransitions?: Record<string, string[]>;
}) {
  const projectId = data.projectId ?? null;
  await requireRoleManagement(projectId);

  const isClient = Boolean(data.isClient);
  const role = await prisma.projectRole.create({
    data: isClient
      ? {
          projectId,
          name: data.name,
          description: data.description ?? "Can only access this project's client chat.",
          ...clientRoleWriteData(true),
        }
      : {
          projectId,
          name: data.name,
          description: data.description,
          isAdmin: data.isAdmin ?? false,
          isClient: false,
          canCreateTask: data.canCreateTask,
          canModifyTask: data.canModifyTask,
          canMoveTask: data.canMoveTask,
          canDeleteTask: data.canDeleteTask ?? false,
          canDeclineTask: data.canDeclineTask ?? false,
          isTeamLead: data.isTeamLead ?? false,
          canCreateSprintPlanning: data.canCreateSprintPlanning ?? false,
          canStartSprint: data.canStartSprint ?? false,
          canEndSprint: data.canEndSprint ?? false,
          canDeleteSprint: data.canDeleteSprint ?? false,
          canViewTaskHistory: data.canViewTaskHistory ?? false,
          allowedTransitions: data.allowedTransitions
            ? JSON.stringify(data.allowedTransitions)
            : null,
        },
  });

  revalidateRoles(projectId);
  return role;
}

export async function updateRole(data: {
  roleId: string;
  name?: string;
  description?: string;
  isClient?: boolean;
  canCreateTask?: boolean;
  canModifyTask?: boolean;
  canMoveTask?: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  isTeamLead?: boolean;
  canCreateSprintPlanning?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canDeleteSprint?: boolean;
  canViewTaskHistory?: boolean;
  allowedTransitions?: Record<string, string[]>;
}) {
  const existing = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!existing) throw new Error("Role not found");
  await requireRoleManagement(existing.projectId);

  if (existing.isAdmin && data.isClient) {
    throw new Error("The Admin role cannot be chat-only");
  }

  const isClient = data.isClient ?? existing.isClient;
  const updated = await prisma.projectRole.update({
    where: { id: data.roleId },
    data: isClient
      ? {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...clientRoleWriteData(true),
        }
      : {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          isClient: false,
          ...(data.canCreateTask !== undefined && { canCreateTask: data.canCreateTask }),
          ...(data.canModifyTask !== undefined && { canModifyTask: data.canModifyTask }),
          ...(data.canMoveTask !== undefined && { canMoveTask: data.canMoveTask }),
          ...(data.canDeleteTask !== undefined && { canDeleteTask: data.canDeleteTask }),
          ...(data.canDeclineTask !== undefined && { canDeclineTask: data.canDeclineTask }),
          ...(data.isTeamLead !== undefined && { isTeamLead: data.isTeamLead }),
          ...(data.canCreateSprintPlanning !== undefined && {
            canCreateSprintPlanning: data.canCreateSprintPlanning,
          }),
          ...(data.canStartSprint !== undefined && { canStartSprint: data.canStartSprint }),
          ...(data.canEndSprint !== undefined && { canEndSprint: data.canEndSprint }),
          ...(data.canDeleteSprint !== undefined && { canDeleteSprint: data.canDeleteSprint }),
          ...(data.canViewTaskHistory !== undefined && {
            canViewTaskHistory: data.canViewTaskHistory,
          }),
          ...(data.allowedTransitions !== undefined && {
            allowedTransitions: JSON.stringify(data.allowedTransitions),
          }),
        },
  });

  revalidateRoles(existing.projectId);
  return updated;
}

// Returns { error } instead of throwing: thrown server-action errors are
// masked in production ("An error occurred in the Server Components render"),
// so the user would never see the reason.
export async function deleteRole(roleId: string): Promise<{ error?: string }> {
  const role = await prisma.projectRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { members: true } } },
  });
  if (!role) return { error: "Role not found" };

  try {
    await requireRoleManagement(role.projectId);
  } catch (err) {
    return { error: (err as Error).message };
  }

  if (role.isAdmin) return { error: "Cannot delete the Admin role" };
  if (role._count.members > 0) {
    return {
      error: `Cannot delete "${role.name}" — ${role._count.members} member${role._count.members !== 1 ? "s" : ""} still ${role._count.members !== 1 ? "have" : "has"} this role. Reassign them first.`,
    };
  }

  await prisma.projectRole.delete({ where: { id: roleId } });

  revalidateRoles(role.projectId);
  return {};
}
