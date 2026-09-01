"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { clientRoleWriteData } from "@/lib/client-role";

export async function ensureClientRole() {
  const byFlag = await prisma.projectRole.findFirst({ where: { isClient: true } });
  if (byFlag) return byFlag;

  const byName = await prisma.projectRole.findFirst({
    where: { name: { equals: "Client", mode: "insensitive" } },
  });
  if (byName) {
    return prisma.projectRole.update({
      where: { id: byName.id },
      data: clientRoleWriteData(true),
    });
  }

  return prisma.projectRole.create({
    data: {
      name: "Client",
      description: "Can only access this project's client chat.",
      ...clientRoleWriteData(true),
    },
  });
}

export async function getRoles() {
  await ensureClientRole();
  return prisma.projectRole.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function createRole(data: {
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
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Only admins can manage roles");

  const isClient = Boolean(data.isClient);
  const role = await prisma.projectRole.create({
    data: isClient
      ? {
          name: data.name,
          description: data.description ?? "Can only access this project's client chat.",
          ...clientRoleWriteData(true),
        }
      : {
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

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admin");
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
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Only admins can manage roles");

  const existing = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!existing) throw new Error("Role not found");
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

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admin");
  return updated;
}

// Returns { error } instead of throwing: thrown server-action errors are
// masked in production ("An error occurred in the Server Components render"),
// so the user would never see the reason.
export async function deleteRole(roleId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") return { error: "Only admins can manage roles" };

  const role = await prisma.projectRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { members: true } } },
  });
  if (!role) return { error: "Role not found" };
  if (role.isAdmin) return { error: "Cannot delete the Admin role" };
  if (role._count.members > 0) {
    return {
      error: `Cannot delete "${role.name}" — ${role._count.members} member${role._count.members !== 1 ? "s" : ""} still ${role._count.members !== 1 ? "have" : "has"} this role. Reassign them first.`,
    };
  }

  await prisma.projectRole.delete({ where: { id: roleId } });

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admin");
  return {};
}
