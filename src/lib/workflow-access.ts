import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { requireContactsAccess } from "@/lib/contacts-access";
import {
  FULL_WORKFLOW_PERMISSIONS,
  MEMBER_WORKFLOW_PERMISSIONS,
  MOVE_PERMISSION_DENIED,
  WORKFLOW_ACTION_LABEL,
  canTakeTransition,
  canWorkflow,
  hydrateWorkflowPermissions,
  type WorkflowAction,
  type WorkflowPermissions,
} from "@/lib/workflow-permissions";

/**
 * Project membership (or contacts access) decides whether the board is
 * visible. This flow's named roles, plus this flow's blueprint, decide
 * what may be done. Sprint ProjectRole is never read.
 */

export interface WorkflowContext {
  userId: string;
  workflow: { id: string; entityType: string; projectId: string; name: string };
  permissions: WorkflowPermissions;
  isSystemAdmin: boolean;
}

export interface ModuleRoleContext {
  userId: string;
  entityType: string;
  projectId: string;
  permissions: WorkflowPermissions;
  isSystemAdmin: boolean;
}

export class WorkflowAccessError extends Error {}

export type WorkflowResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function runWorkflowAction<T>(
  fn: () => Promise<T>,
): Promise<WorkflowResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Something went wrong.";
    if (!(error instanceof WorkflowAccessError)) {
      console.error("[workflow-role]", error);
    }
    return { success: false, error: message };
  }
}

export async function seedModuleRolesIfMissing(
  _entityType: string,
  _projectId: string,
  _options: { creatorUserId?: string; existing?: boolean } = {},
): Promise<void> {
  // Roles are created by name on the board. Nothing is seeded.
}

/** Resolves the project from a flow, then seeds the project-level roles. */
export async function seedWorkflowRolesIfMissing(
  workflowId: string,
  options: { creatorUserId?: string; existing?: boolean } = {},
): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { entityType: true, projectId: true },
  });
  if (!workflow) return;
  await seedModuleRolesIfMissing(
    workflow.entityType,
    workflow.projectId,
    options,
  );
}

async function assertModuleVisible(
  entityType: string,
  projectId: string,
): Promise<{ userId: string; systemRole: string }> {
  if (entityType === "board") {
    if (!projectId) {
      throw new WorkflowAccessError("Open this from a project.");
    }
    const { user } = await requireProjectMember(projectId);
    if (user.systemRole === "CLIENT") {
      throw new WorkflowAccessError(
        "Boards are not available to client accounts.",
      );
    }
    return { userId: user.id, systemRole: user.systemRole };
  }
  const user = await requireContactsAccess();
  return { userId: user.id, systemRole: user.systemRole };
}

async function resolveModuleRoleIds(
  workflowId: string,
  userId: string,
): Promise<string[]> {
  const members = await prisma.moduleRoleMember.findMany({
    where: { userId, role: { workflowId } },
    select: { roleId: true },
  });
  return members.map((member) => member.roleId);
}

async function loadContext(workflowId: string): Promise<WorkflowContext> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { id: true, entityType: true, projectId: true, name: true },
  });
  if (!workflow) throw new WorkflowAccessError("That flow no longer exists.");

  const { userId, systemRole } = await assertModuleVisible(
    workflow.entityType,
    workflow.projectId,
  );

  const [roleIds, statuses, transitions] = await Promise.all([
    resolveModuleRoleIds(workflow.id, userId),
    prisma.workflowStatus.findMany({
      where: { workflowId: workflow.id },
      select: { id: true, modifyByRole: true },
    }),
    prisma.workflowTransition.findMany({
      where: { workflowId: workflow.id },
      select: { fromStatusId: true, toStatusId: true, moveRoleIds: true },
    }),
  ]);

  const permissions = hydrateWorkflowPermissions(roleIds, {
    statuses,
    transitions,
  });
  if (systemRole === "ADMIN") {
    permissions.canCreateRecord = true;
    permissions.canDeleteRecord = true;
    permissions.canManageRoles = true;
    permissions.canEditBlueprint = true;
  }

  return {
    userId,
    workflow,
    permissions,
    isSystemAdmin: systemRole === "ADMIN",
  };
}

async function loadModuleContext(
  entityType: string,
  projectId: string,
): Promise<ModuleRoleContext> {
  const { userId, systemRole } = await assertModuleVisible(
    entityType,
    projectId,
  );

  if (systemRole === "ADMIN") {
    return {
      userId,
      entityType,
      projectId,
      permissions: { ...FULL_WORKFLOW_PERMISSIONS },
      isSystemAdmin: true,
    };
  }

  return {
    userId,
    entityType,
    projectId,
    permissions: { ...MEMBER_WORKFLOW_PERMISSIONS },
    isSystemAdmin: false,
  };
}

export const flowContextForWorkflow = cache((workflowId: string) =>
  loadContext(workflowId),
);

export function assertFlowAction(
  context: { permissions: WorkflowPermissions },
  action: WorkflowAction,
): void {
  if (canWorkflow(context.permissions, action)) return;
  throw new WorkflowAccessError(
    `You do not have permission to ${WORKFLOW_ACTION_LABEL[action]}.`,
  );
}

export async function requireFlowAction(
  workflowId: string,
  action: WorkflowAction,
): Promise<WorkflowContext> {
  const context = await flowContextForWorkflow(workflowId);
  assertFlowAction(context, action);
  return context;
}

export async function requireModuleVisible(
  entityType: string,
  projectId: string,
): Promise<{ userId: string; isSystemAdmin: boolean }> {
  const { userId, systemRole } = await assertModuleVisible(
    entityType,
    projectId,
  );
  return { userId, isSystemAdmin: systemRole === "ADMIN" };
}

export async function requireModuleAction(
  entityType: string,
  projectId: string,
  action: WorkflowAction,
): Promise<ModuleRoleContext> {
  const context = await loadModuleContext(entityType, projectId);
  assertFlowAction(context, action);
  return context;
}

export async function requireFlowTransition(
  workflowId: string,
  fromStatusId: string | null,
  toStatusId: string | null,
): Promise<WorkflowContext> {
  const context = await requireFlowAction(workflowId, "moveRecord");
  if (!canTakeTransition(context.permissions, fromStatusId, toStatusId)) {
    throw new WorkflowAccessError(MOVE_PERMISSION_DENIED);
  }
  return context;
}

export async function getFlowPermissions(
  workflowId: string,
): Promise<WorkflowPermissions> {
  try {
    const context = await flowContextForWorkflow(workflowId);
    return context.permissions;
  } catch {
    return {
      isAdmin: false,
      canCreateRecord: false,
      canEditRecord: false,
      canDeleteRecord: false,
      canMoveRecord: false,
      canManageRoles: false,
      canEditBlueprint: false,
      allowedTransitions: null,
      modifyFields: null,
    };
  }
}
