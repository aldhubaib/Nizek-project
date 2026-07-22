"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getRoles() {
  return prisma.projectRole.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function createRole(data: {
  name: string;
  description?: string;
  isAdmin?: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  allowedTransitions?: Record<string, string[]>;
}) {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Only admins can manage roles");

  const role = await prisma.projectRole.create({
    data: {
      name: data.name,
      description: data.description,
      isAdmin: data.isAdmin ?? false,
      canCreateTask: data.canCreateTask,
      canModifyTask: data.canModifyTask,
      canMoveTask: data.canMoveTask,
      canDeleteTask: data.canDeleteTask ?? false,
      canDeclineTask: data.canDeclineTask ?? false,
      allowedTransitions: data.allowedTransitions ? JSON.stringify(data.allowedTransitions) : null,
    },
  });

  revalidatePath("/dashboard/roles");
  return role;
}

export async function updateRole(data: {
  roleId: string;
  name?: string;
  description?: string;
  canCreateTask?: boolean;
  canModifyTask?: boolean;
  canMoveTask?: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  allowedTransitions?: Record<string, string[]>;
}) {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Only admins can manage roles");

  const updated = await prisma.projectRole.update({
    where: { id: data.roleId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.canCreateTask !== undefined && { canCreateTask: data.canCreateTask }),
      ...(data.canModifyTask !== undefined && { canModifyTask: data.canModifyTask }),
      ...(data.canMoveTask !== undefined && { canMoveTask: data.canMoveTask }),
      ...(data.canDeleteTask !== undefined && { canDeleteTask: data.canDeleteTask }),
      ...(data.canDeclineTask !== undefined && { canDeclineTask: data.canDeclineTask }),
      ...(data.allowedTransitions !== undefined && { allowedTransitions: JSON.stringify(data.allowedTransitions) }),
    },
  });

  revalidatePath("/dashboard/roles");
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
  return {};
}
