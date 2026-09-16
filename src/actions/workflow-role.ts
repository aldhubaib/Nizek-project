"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  WorkflowAccessError,
  requireModuleAction,
  requireModuleVisible,
  runWorkflowAction,
  seedModuleRolesIfMissing,
  type WorkflowResult,
} from "@/lib/workflow-access";
import { getModule, projectBoardPaths } from "@/lib/modules/registry";
import {
  ROLE_IN_USE_ON_BLUEPRINT,
  roleIsUsedOnBlueprint,
  roleIdsUsedOnBlueprint,
  type WorkflowPermissions,
} from "@/lib/workflow-permissions";

/**
 * Named roles for a project board (or a global module). Field and move
 * rules live on the blueprint, not here. Sprint ProjectRole is not reused.
 */

export interface WorkflowRoleDTO {
  id: string;
  name: string;
  inUse: boolean;
  members: WorkflowFlowMemberDTO[];
}

export interface WorkflowFlowMemberDTO {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  roleId: string;
  roleName: string;
}

export interface WorkflowRoleCandidateDTO {
  userId: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

export interface WorkflowRoleSettingsDTO {
  entityType: string;
  projectId: string;
  flows: WorkflowRoleFlowDTO[];
  people: WorkflowRoleCandidateDTO[];
}

export interface WorkflowRoleFlowDTO {
  id: string;
  name: string;
  roles: WorkflowRoleDTO[];
}

export interface ModuleRoleOption {
  id: string;
  name: string;
  workflowId: string;
}

function revalidateFlow(entityType: string, projectId: string) {
  if (entityType === "board") {
    for (const path of projectBoardPaths(projectId)) revalidatePath(path);
    revalidatePath(`/dashboard/projects/${projectId}/board/settings/roles`);
    return;
  }
  const mod = getModule(entityType);
  for (const path of mod.revalidatePaths) revalidatePath(path);
  revalidatePath(`${mod.settingsPath}/roles`);
}

function toRoleDTO(
  role: {
    id: string;
    name: string;
    members: {
      id: string;
      userId: string;
      user: {
        name: string | null;
        email: string;
        imageUrl: string | null;
      };
    }[];
  },
  inUse: boolean,
): WorkflowRoleDTO {
  return {
    id: role.id,
    name: role.name,
    inUse,
    members: (role.members ?? []).map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      imageUrl: member.user.imageUrl,
      roleId: role.id,
      roleName: role.name,
    })),
  };
}

export async function listModuleRoles(
  entityType: string,
  projectId = "",
): Promise<ModuleRoleOption[]> {
  try {
    await requireModuleVisible(entityType, projectId);
  } catch {
    return [];
  }
  await seedModuleRolesIfMissing(entityType, projectId, { existing: true });
  return prisma.moduleRole.findMany({
    where: { entityType, projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, workflowId: true },
  });
}

export async function getWorkflowRoleSettings(
  entityType: string,
  projectId = "",
): Promise<WorkflowRoleSettingsDTO | null> {
  let context;
  try {
    context = await requireModuleAction(entityType, projectId, "manageRoles");
  } catch {
    return null;
  }

  await seedModuleRolesIfMissing(entityType, projectId, { existing: true });

  const [workflows, roles, people, statuses, transitions] = await Promise.all([
    prisma.workflow.findMany({
      where: { entityType, projectId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.moduleRole.findMany({
      where: { entityType, projectId },
      orderBy: { createdAt: "asc" },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, imageUrl: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    listPeople({ entityType, projectId: context.projectId }),
    prisma.workflowStatus.findMany({
      where: { workflow: { entityType, projectId } },
      select: { modifyByRole: true },
    }),
    prisma.workflowTransition.findMany({
      where: { workflow: { entityType, projectId } },
      select: { moveRoleIds: true },
    }),
  ]);

  const used = roleIdsUsedOnBlueprint({ statuses, transitions });
  const rolesByFlow = new Map<string, WorkflowRoleDTO[]>();
  for (const role of roles) {
    const list = rolesByFlow.get(role.workflowId) ?? [];
    list.push(toRoleDTO(role, used.has(role.id)));
    rolesByFlow.set(role.workflowId, list);
  }

  return {
    entityType,
    projectId,
    flows: workflows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      roles: rolesByFlow.get(flow.id) ?? [],
    })),
    people,
  };
}

async function listPeople(scope: {
  entityType: string;
  projectId: string;
}): Promise<WorkflowRoleCandidateDTO[]> {
  if (scope.entityType === "board" && scope.projectId) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: scope.projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            imageUrl: true,
            systemRole: true,
          },
        },
      },
    });
    return members
      .filter((member) => member.user.systemRole !== "CLIENT")
      .map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        imageUrl: member.user.imageUrl,
      }));
  }

  const allowed = await prisma.contactsPermission.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  });
  return allowed.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    imageUrl: row.user.imageUrl,
  }));
}

const FLAG_KEYS = [
  "isAdmin",
  "canCreateRecord",
  "canEditRecord",
  "canDeleteRecord",
  "canMoveRecord",
  "canManageRoles",
  "canEditBlueprint",
] as const;

function flagsFrom(
  input: Partial<WorkflowPermissions>,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const key of FLAG_KEYS) {
    if (input[key] !== undefined) flags[key] = Boolean(input[key]);
  }
  return flags;
}

export async function createWorkflowRole(input: {
  entityType: string;
  projectId?: string;
  workflowId: string;
  name: string;
  permissions?: Partial<WorkflowPermissions>;
}): Promise<WorkflowResult<{ id: string }>> {
  return runWorkflowAction(async () => {
    const projectId = input.projectId ?? "";
    const context = await requireModuleAction(
      input.entityType,
      projectId,
      "manageRoles",
    );
    const name = input.name.trim();
    if (!name) throw new WorkflowAccessError("A role needs a name.");

    const workflow = await prisma.workflow.findFirst({
      where: {
        id: input.workflowId,
        entityType: input.entityType,
        projectId,
      },
      select: { id: true },
    });
    if (!workflow) throw new WorkflowAccessError("That task flow no longer exists.");

    const clash = await prisma.moduleRole.findFirst({
      where: { workflowId: workflow.id, name },
      select: { id: true },
    });
    if (clash) {
      throw new WorkflowAccessError(
        `There is already a role called “${name}” on this task flow.`,
      );
    }

    const role = await prisma.moduleRole.create({
      data: {
        workflowId: workflow.id,
        entityType: input.entityType,
        projectId,
        name,
        ...flagsFrom(input.permissions ?? {}),
      },
      select: { id: true },
    });

    revalidateFlow(context.entityType, context.projectId);
    return role;
  });
}

export async function updateWorkflowRole(input: {
  roleId: string;
  name?: string;
  permissions?: Partial<WorkflowPermissions>;
}): Promise<WorkflowResult<null>> {
  return runWorkflowAction(async () => {
    const role = await prisma.moduleRole.findUnique({
      where: { id: input.roleId },
      select: { id: true, entityType: true, projectId: true, workflowId: true },
    });
    if (!role) throw new WorkflowAccessError("That role no longer exists.");

    const context = await requireModuleAction(
      role.entityType,
      role.projectId,
      "manageRoles",
    );

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new WorkflowAccessError("A role needs a name.");
    }
    if (name) {
      const clash = await prisma.moduleRole.findFirst({
        where: {
          workflowId: role.workflowId,
          name,
          id: { not: input.roleId },
        },
        select: { id: true },
      });
      if (clash) {
        throw new WorkflowAccessError(
          `There is already a role called “${name}”.`,
        );
      }
    }

    const next: {
      name?: string;
      isAdmin?: boolean;
      canCreateRecord?: boolean;
      canEditRecord?: boolean;
      canDeleteRecord?: boolean;
      canMoveRecord?: boolean;
      canManageRoles?: boolean;
      canEditBlueprint?: boolean;
    } = {
      ...(name ? { name } : {}),
      ...flagsFrom(input.permissions ?? {}),
    };

    if (next.isAdmin === false) {
      const otherAdmins = await prisma.moduleRole.count({
        where: {
          workflowId: role.workflowId,
          isAdmin: true,
          id: { not: input.roleId },
        },
      });
      if (otherAdmins === 0) {
        throw new WorkflowAccessError("Keep at least one admin role.");
      }
    }

    await prisma.moduleRole.update({ where: { id: input.roleId }, data: next });
    revalidateFlow(context.entityType, context.projectId);
    return null;
  });
}

export async function setDefaultWorkflowRole(
  roleId: string,
): Promise<WorkflowResult<null>> {
  return runWorkflowAction(async () => {
    const role = await prisma.moduleRole.findUnique({
      where: { id: roleId },
      select: { entityType: true, projectId: true, workflowId: true },
    });
    if (!role) throw new WorkflowAccessError("That role no longer exists.");
    const context = await requireModuleAction(
      role.entityType,
      role.projectId,
      "manageRoles",
    );

    await prisma.$transaction([
      prisma.moduleRole.updateMany({
        where: {
          workflowId: role.workflowId,
          isDefault: true,
        },
        data: { isDefault: false },
      }),
      prisma.moduleRole.update({
        where: { id: roleId },
        data: { isDefault: true },
      }),
    ]);

    revalidateFlow(context.entityType, context.projectId);
    return null;
  });
}

export async function deleteWorkflowRole(
  roleId: string,
): Promise<WorkflowResult<null>> {
  return runWorkflowAction(async () => {
    const role = await prisma.moduleRole.findUnique({
      where: { id: roleId },
      select: {
        entityType: true,
        projectId: true,
        isDefault: true,
        isAdmin: true,
        _count: { select: { members: true } },
      },
    });
    if (!role) throw new WorkflowAccessError("That role no longer exists.");
    const context = await requireModuleAction(
      role.entityType,
      role.projectId,
      "manageRoles",
    );

    const [statuses, transitions] = await Promise.all([
      prisma.workflowStatus.findMany({
        where: {
          workflow: { entityType: role.entityType, projectId: role.projectId },
        },
        select: { modifyByRole: true },
      }),
      prisma.workflowTransition.findMany({
        where: {
          workflow: { entityType: role.entityType, projectId: role.projectId },
        },
        select: { moveRoleIds: true },
      }),
    ]);
    if (roleIsUsedOnBlueprint(roleId, { statuses, transitions })) {
      throw new WorkflowAccessError(ROLE_IN_USE_ON_BLUEPRINT);
    }

    if (role._count.members > 0) {
      throw new WorkflowAccessError(
        `${role._count.members} ${role._count.members === 1 ? "person holds" : "people hold"} that role. Move them to another one first.`,
      );
    }

    await prisma.moduleRole.delete({ where: { id: roleId } });
    revalidateFlow(context.entityType, context.projectId);
    return null;
  });
}

export async function setWorkflowMemberRole(input: {
  entityType: string;
  projectId?: string;
  userId: string;
  roleId: string;
}): Promise<WorkflowResult<null>> {
  return runWorkflowAction(async () => {
    const projectId = input.projectId ?? "";
    const context = await requireModuleAction(
      input.entityType,
      projectId,
      "manageRoles",
    );

    if (context.entityType === "board") {
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          userId_projectId: {
            userId: input.userId,
            projectId: context.projectId,
          },
        },
        select: { user: { select: { systemRole: true } } },
      });
      if (!projectMember) {
        throw new WorkflowAccessError("That person is not on this project.");
      }
      if (projectMember.user.systemRole === "CLIENT") {
        throw new WorkflowAccessError(
          "Boards are not available to client accounts.",
        );
      }
    } else {
      const allowed = await prisma.contactsPermission.findUnique({
        where: { userId: input.userId },
        select: { userId: true },
      });
      if (!allowed) {
        throw new WorkflowAccessError("That person cannot access this module.");
      }
    }

    const role = await prisma.moduleRole.findFirst({
      where: {
        id: input.roleId,
        entityType: input.entityType,
        projectId,
      },
      select: { id: true },
    });
    if (!role) throw new WorkflowAccessError("That role is not on this task flow.");

    await prisma.moduleRoleMember.upsert({
      where: {
        roleId_userId: {
          roleId: input.roleId,
          userId: input.userId,
        },
      },
      create: {
        entityType: input.entityType,
        projectId,
        userId: input.userId,
        roleId: input.roleId,
      },
      update: {},
    });

    revalidateFlow(context.entityType, context.projectId);
    return null;
  });
}

export async function removeWorkflowMember(input: {
  entityType: string;
  projectId?: string;
  userId: string;
  roleId: string;
}): Promise<WorkflowResult<null>> {
  return runWorkflowAction(async () => {
    const projectId = input.projectId ?? "";
    const context = await requireModuleAction(
      input.entityType,
      projectId,
      "manageRoles",
    );
    await prisma.moduleRoleMember.deleteMany({
      where: {
        entityType: input.entityType,
        projectId,
        userId: input.userId,
        roleId: input.roleId,
      },
    });
    revalidateFlow(context.entityType, context.projectId);
    return null;
  });
}
