"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getRoles(projectId: string) {
  return prisma.projectRole.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function createRole(data: {
  projectId: string;
  name: string;
  isAdmin?: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  allowedStages?: string[];
  allowedTransitions?: Record<string, string[]>;
}) {
  await requireProjectRole(data.projectId, ["ADMIN"]);

  const role = await prisma.projectRole.create({
    data: {
      name: data.name,
      isAdmin: data.isAdmin ?? false,
      canCreateTask: data.canCreateTask,
      canModifyTask: data.canModifyTask,
      canMoveTask: data.canMoveTask,
      canDeleteTask: data.canDeleteTask ?? false,
      canDeclineTask: data.canDeclineTask ?? false,
      allowedStages: data.allowedStages ? JSON.stringify(data.allowedStages) : null,
      allowedTransitions: data.allowedTransitions ? JSON.stringify(data.allowedTransitions) : null,
      projectId: data.projectId,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return role;
}

export async function updateRole(data: {
  roleId: string;
  name?: string;
  canCreateTask?: boolean;
  canModifyTask?: boolean;
  canMoveTask?: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  allowedStages?: string[];
  allowedTransitions?: Record<string, string[]>;
}) {
  const role = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!role) throw new Error("Role not found");
  await requireProjectRole(role.projectId, ["ADMIN"]);

  const updated = await prisma.projectRole.update({
    where: { id: data.roleId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.canCreateTask !== undefined && { canCreateTask: data.canCreateTask }),
      ...(data.canModifyTask !== undefined && { canModifyTask: data.canModifyTask }),
      ...(data.canMoveTask !== undefined && { canMoveTask: data.canMoveTask }),
      ...(data.canDeleteTask !== undefined && { canDeleteTask: data.canDeleteTask }),
      ...(data.canDeclineTask !== undefined && { canDeclineTask: data.canDeclineTask }),
      ...(data.allowedStages !== undefined && { allowedStages: JSON.stringify(data.allowedStages) }),
      ...(data.allowedTransitions !== undefined && { allowedTransitions: JSON.stringify(data.allowedTransitions) }),
    },
  });

  revalidatePath(`/dashboard/projects/${role.projectId}`);
  return updated;
}

export async function deleteRole(roleId: string) {
  const role = await prisma.projectRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { members: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isAdmin) throw new Error("Cannot delete the Admin role");
  if (role._count.members > 0) throw new Error("Cannot delete a role that has members assigned");

  await requireProjectRole(role.projectId, ["ADMIN"]);
  await prisma.projectRole.delete({ where: { id: roleId } });

  revalidatePath(`/dashboard/projects/${role.projectId}`);
}
