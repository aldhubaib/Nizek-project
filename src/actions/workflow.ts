"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { requireProjectMember, requireUser } from "@/lib/auth";
import { getModule, projectBoardPaths } from "@/lib/modules/registry";
import { isBoardColor, DEFAULT_BOARD_COLOR } from "@/lib/board-palette";
import { planReorder, positionBetween } from "@/lib/board-order";
import {
  assertActionAllowed,
  cleanActionConfig,
  isWorkflowActionType,
  isWorkflowHook,
  parseActionConfig,
  stringifyActionConfig,
} from "@/lib/workflow/actions";
import {
  WORKFLOW_STATUS_KINDS,
  type WorkflowActionDef,
  type WorkflowEntityType,
  type WorkflowHook,
  type WorkflowStatusKind,
  type WorkflowTransitionDef,
} from "@/lib/workflow/types";

export type WorkflowDTO = {
  id: string;
  entityType: WorkflowEntityType;
  name: string;
  position: number;
  statusCount: number;
  recordCount: number;
  layoutId: string | null;
  layoutName: string | null;
  blueprintEnabled: boolean;
  updatedAt: string;
};

export type WorkflowActionDTO = WorkflowActionDef;

export type WorkflowStatusDTO = {
  id: string;
  workflowId: string;
  name: string;
  color: string;
  kind: WorkflowStatusKind;
  position: number;
  canvasX: number | null;
  canvasY: number | null;
  actions: WorkflowActionDTO[];
};

export type WorkflowTransitionDTO = WorkflowTransitionDef;

export type WorkflowSettingsDTO = {
  workflows: WorkflowDTO[];
  statuses: WorkflowStatusDTO[];
  transitions: WorkflowTransitionDTO[];
};

export type WorkflowUserOption = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_NAME = 40;
const DEAL_PATHS = [
  "/dashboard/deals",
  "/dashboard/deals/settings",
  "/dashboard/deals/settings/blueprint",
  "/dashboard/deals/settings/layout",
  "/dashboard/deals/settings/flows",
];

async function wfAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[workflow:${label}]`, err);
    return { ok: false, error };
  }
}

function cleanName(raw: string, label: string): string {
  const name = raw.trim();
  if (!name) throw new Error(`${label} is required`);
  if (name.length > MAX_NAME) {
    throw new Error(`Keep the name under ${MAX_NAME} characters`);
  }
  return name;
}

function cleanColor(raw: string | null | undefined): string {
  const color = raw?.trim();
  return color && isBoardColor(color) ? color : DEFAULT_BOARD_COLOR;
}

function cleanKind(raw: string | null | undefined): WorkflowStatusKind {
  const kind = raw?.trim();
  return (WORKFLOW_STATUS_KINDS as readonly string[]).includes(kind ?? "")
    ? (kind as WorkflowStatusKind)
    : "open";
}

function toActionDTO(row: {
  id: string;
  hook: string;
  type: string;
  config: string;
  position: number;
}): WorkflowActionDTO {
  return {
    id: row.id,
    hook: isWorkflowHook(row.hook) ? row.hook : "during",
    type: isWorkflowActionType(row.type) ? row.type : "message",
    config: parseActionConfig(row.config),
    position: row.position,
  };
}

function toStatusDTO(row: {
  id: string;
  workflowId: string;
  name: string;
  color: string;
  kind: string;
  position: number;
  canvasX: number | null;
  canvasY: number | null;
  actions?: { id: string; hook: string; type: string; config: string; position: number }[];
}): WorkflowStatusDTO {
  return {
    id: row.id,
    workflowId: row.workflowId,
    name: row.name,
    color: row.color,
    kind: cleanKind(row.kind),
    position: row.position,
    canvasX: row.canvasX,
    canvasY: row.canvasY,
    actions: (row.actions ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toActionDTO),
  };
}

function toTransitionDTO(row: {
  id: string;
  workflowId: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  canvasX: number | null;
  canvasY: number | null;
  actions?: { id: string; hook: string; type: string; config: string; position: number }[];
}): WorkflowTransitionDTO {
  return {
    id: row.id,
    workflowId: row.workflowId,
    name: row.name,
    fromStatusId: row.fromStatusId,
    toStatusId: row.toStatusId,
    canvasX: row.canvasX,
    canvasY: row.canvasY,
    actions: (row.actions ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toActionDTO),
  };
}

function revalidateWorkflow(entityType: string, projectId = "") {
  if (entityType === "deal") {
    for (const path of DEAL_PATHS) revalidatePath(path);
    return;
  }
  if (entityType === "board" && projectId) {
    for (const path of projectBoardPaths(projectId)) revalidatePath(path);
    return;
  }
  for (const path of getModule(entityType).revalidatePaths) {
    revalidatePath(path);
  }
}

async function requireModuleAccess(entityType: string, projectId = "") {
  if (entityType === "board") {
    if (!projectId) throw new Error("Open this from a project");
    await requireProjectMember(projectId);
    return;
  }
  await requireContactsAccess();
}

async function requireDealWorkflow(id: string) {
  const row = await prisma.workflow.findUnique({
    where: { id },
    select: { id: true, entityType: true, projectId: true },
  });
  if (!row) throw new Error("That flow no longer exists");
  await requireModuleAccess(row.entityType, row.projectId);
  return row;
}

function toWorkflowDTO(
  row: {
    id: string;
    entityType: string;
    name: string;
    position: number;
    updatedAt: Date;
    blueprintEnabled?: boolean;
    _count?: {
      statuses: number;
      deals?: number;
      boardRecords?: number;
      contacts?: number;
      companies?: number;
    };
  },
  layout: { id: string; name: string } | undefined,
  counts?: { statusCount: number; recordCount: number },
): WorkflowDTO {
  return {
    id: row.id,
    entityType: row.entityType as WorkflowEntityType,
    name: row.name,
    position: row.position,
    statusCount: counts?.statusCount ?? row._count?.statuses ?? 0,
    recordCount:
      counts?.recordCount ??
      (row._count?.deals ?? 0) +
        (row._count?.boardRecords ?? 0) +
        (row._count?.contacts ?? 0) +
        (row._count?.companies ?? 0),
    layoutId: layout?.id ?? null,
    layoutName: layout?.name ?? null,
    blueprintEnabled: row.blueprintEnabled ?? true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWorkflows(
  entityType: WorkflowEntityType = "deal",
  projectId = "",
): Promise<WorkflowDTO[]> {
  await requireModuleAccess(entityType, projectId);
  const rows = await prisma.workflow.findMany({
    where: { entityType, projectId },
    orderBy: { position: "asc" },
    include: {
      _count: {
        select: {
          statuses: true,
          deals: true,
          boardRecords: true,
          contacts: true,
          companies: true,
        },
      },
    },
  });
  const layouts = await workflowLayoutMap(rows.map((row) => row.id));
  return rows.map((row) => toWorkflowDTO(row, layouts.get(row.id)));
}

async function workflowLayoutMap(workflowIds: string[]) {
  const map = new Map<string, { id: string; name: string }>();
  if (workflowIds.length === 0) return map;
  const rows = await prisma.$queryRaw<
    { workflowId: string; id: string | null; name: string | null }[]
  >`
    SELECT w.id AS "workflowId", l.id, l.name
    FROM "Workflow" w
    LEFT JOIN "FormLayout" l ON l.id = w."layoutId"
    WHERE w.id IN (${Prisma.join(workflowIds)})
  `;
  for (const row of rows) {
    if (row.id && row.name) map.set(row.workflowId, { id: row.id, name: row.name });
  }
  return map;
}

export async function getWorkflowSettings(
  entityType: WorkflowEntityType = "deal",
  projectId = "",
): Promise<WorkflowSettingsDTO> {
  await requireModuleAccess(entityType, projectId);
  const [workflows, statuses, transitions] = await Promise.all([
    listWorkflows(entityType, projectId),
    prisma.workflowStatus.findMany({
      where: { workflow: { entityType, projectId } },
      orderBy: [{ workflowId: "asc" }, { position: "asc" }],
      include: { actions: true },
    }),
    prisma.workflowTransition.findMany({
      where: { workflow: { entityType, projectId } },
      include: { actions: true },
    }),
  ]);
  return {
    workflows,
    statuses: statuses.map(toStatusDTO),
    transitions: transitions.map(toTransitionDTO),
  };
}

export async function listWorkflowStatuses(
  workflowId: string,
): Promise<WorkflowStatusDTO[]> {
  await requireDealWorkflow(workflowId);
  const rows = await prisma.workflowStatus.findMany({
    where: { workflowId },
    orderBy: { position: "asc" },
    include: { actions: true },
  });
  return rows.map(toStatusDTO);
}

export async function listWorkflowTransitions(
  workflowId: string,
): Promise<WorkflowTransitionDTO[]> {
  await requireDealWorkflow(workflowId);
  const rows = await prisma.workflowTransition.findMany({
    where: { workflowId },
    include: { actions: true },
  });
  return rows.map(toTransitionDTO);
}

export async function listWorkflowUsers(
  projectId?: string,
): Promise<WorkflowUserOption[]> {
  if (projectId) {
    await requireProjectMember(projectId);
    const members = await prisma.projectMember.findMany({
      where: { projectId, user: { blocked: false } },
      select: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
    return members.map(({ user }) => ({
      id: user.id,
      name: user.name?.trim() || user.email,
      email: user.email,
      imageUrl: user.imageUrl,
    }));
  }

  await requireUser();
  const pending = await prisma.pendingTeamInvite.findMany({
    select: { email: true },
  });
  if (pending.length > 0) {
    const { provisionUserFromPendingInvite } = await import(
      "@/lib/pending-invite"
    );
    for (const row of pending) {
      await provisionUserFromPendingInvite(row.email);
    }
  }
  const rows = await prisma.user.findMany({
    where: { blocked: false },
    select: { id: true, name: true, email: true, imageUrl: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name?.trim() || u.email,
    email: u.email,
    imageUrl: u.imageUrl,
  }));
}

export async function createWorkflow(input: {
  entityType?: WorkflowEntityType;
  projectId?: string;
  name: string;
}): Promise<ActionResult<WorkflowDTO>> {
  return wfAction("create", async () => {
    const entityType = input.entityType ?? "deal";
    const projectId = input.projectId ?? "";
    await requireModuleAccess(entityType, projectId);
    const name = cleanName(input.name, "Flow name");
    const clash = await prisma.workflow.findUnique({
      where: { entityType_projectId_name: { entityType, projectId, name } },
      select: { id: true },
    });
    if (clash) throw new Error(`There is already a “${name}” flow`);

    const last = await prisma.workflow.findFirst({
      where: { entityType, projectId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const layout = await ensureDefaultLayout(entityType, projectId);

    const created = await prisma.workflow.create({
      data: {
        entityType,
        projectId,
        name,
        position: positionBetween(last?.position ?? null, null),
        layoutId: layout.id,
      },
    });

    revalidateWorkflow(entityType, projectId);
    return toWorkflowDTO(created, layout, { statusCount: 0, recordCount: 0 });
  });
}

export async function updateWorkflow(
  id: string,
  input: {
    name?: string;
    layoutId?: string | null;
    blueprintEnabled?: boolean;
  },
): Promise<ActionResult<WorkflowDTO>> {
  return wfAction("update", async () => {
    const existing = await requireDealWorkflow(id);
    const data: {
      name?: string;
      layoutId?: string | null;
      blueprintEnabled?: boolean;
    } = {};
    if (input.name !== undefined) {
      const name = cleanName(input.name, "Flow name");
      const clash = await prisma.workflow.findUnique({
        where: {
          entityType_projectId_name: {
            entityType: existing.entityType,
            projectId: existing.projectId,
            name,
          },
        },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new Error(`There is already a “${name}” flow`);
      }
      data.name = name;
    }
    if (input.layoutId !== undefined) {
      if (input.layoutId) {
        const layout = await prisma.formLayout.findUnique({
          where: { id: input.layoutId },
          select: { id: true, entityType: true, projectId: true },
        });
        if (
          !layout ||
          layout.entityType !== existing.entityType ||
          layout.projectId !== existing.projectId
        ) {
          throw new Error("That layout is not on this module");
        }
      }
      data.layoutId = input.layoutId;
    }
    if (input.blueprintEnabled !== undefined) {
      data.blueprintEnabled = input.blueprintEnabled;
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            statuses: true,
            deals: true,
            boardRecords: true,
            contacts: true,
            companies: true,
          },
        },
      },
    });
    const layouts = await workflowLayoutMap([updated.id]);
    const layout = layouts.get(updated.id);

    revalidateWorkflow(existing.entityType, existing.projectId);
    return toWorkflowDTO(updated, layout);
  });
}

async function ensureDefaultLayout(entityType: string, projectId = "") {
  const existing = await prisma.formLayout.findFirst({
    where: { entityType, projectId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  const created = await prisma.formLayout.create({
    data: {
      entityType,
      projectId,
      name: getModule(entityType).label,
      position: 1,
    },
    select: { id: true, name: true },
  });
  const bindings = getModule(entityType).bindings;
  if (bindings.length > 0) {
    await prisma.customField.createMany({
      data: bindings.map((binding, index) => ({
        entityType,
        layoutId: created.id,
        key: binding.key,
        label: binding.label,
        type: binding.type,
        binding: binding.key,
        required: Boolean(binding.required),
        position: (index + 1) * 64,
      })),
    });
  }
  return created;
}

export async function deleteWorkflow(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return wfAction("delete", async () => {
    const existing = await requireDealWorkflow(id);
    const counts = await prisma.workflow.findUnique({
      where: { id },
      select: {
        _count: {
          select: { deals: true, boardRecords: true, contacts: true, companies: true },
        },
      },
    });
    const remaining = await prisma.workflow.count({
      where: { entityType: existing.entityType, projectId: existing.projectId },
    });
    if (remaining <= 1) throw new Error("Keep at least one flow");
    const held =
      (counts?._count.deals ?? 0) +
      (counts?._count.boardRecords ?? 0) +
      (counts?._count.contacts ?? 0) +
      (counts?._count.companies ?? 0);
    if (held > 0) {
      throw new Error(
        `That flow still holds ${held} record${held === 1 ? "" : "s"}. Move them first.`,
      );
    }

    await prisma.workflow.delete({ where: { id } });
    revalidateWorkflow(existing.entityType, existing.projectId);
    return { id };
  });
}

export async function createWorkflowStatus(input: {
  workflowId: string;
  name: string;
  color?: string;
  kind?: string;
  canvasX?: number | null;
  canvasY?: number | null;
}): Promise<ActionResult<WorkflowStatusDTO>> {
  return wfAction("status-create", async () => {
    const workflow = await requireDealWorkflow(input.workflowId);
    const name = cleanName(input.name, "Status name");

    const clash = await prisma.workflowStatus.findFirst({
      where: { workflowId: input.workflowId, name },
      select: { id: true },
    });
    if (clash) throw new Error(`There is already a “${name}” status`);

    const last = await prisma.workflowStatus.findFirst({
      where: { workflowId: input.workflowId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const count = await prisma.workflowStatus.count({
      where: { workflowId: input.workflowId },
    });

    const created = await prisma.workflowStatus.create({
      data: {
        workflowId: input.workflowId,
        name,
        color: cleanColor(input.color),
        kind: cleanKind(input.kind),
        position: positionBetween(last?.position ?? null, null),
        canvasX: input.canvasX ?? count * 280,
        canvasY: input.canvasY ?? 80,
      },
      include: { actions: true },
    });

    revalidateWorkflow(workflow.entityType, workflow.projectId);
    return toStatusDTO(created);
  });
}

export async function updateWorkflowStatus(
  id: string,
  input: {
    name?: string;
    color?: string;
    kind?: string;
    canvasX?: number | null;
    canvasY?: number | null;
  },
): Promise<ActionResult<WorkflowStatusDTO>> {
  return wfAction("status-update", async () => {
    const existing = await prisma.workflowStatus.findUnique({
      where: { id },
      select: {
        workflowId: true,
        workflow: { select: { entityType: true, projectId: true } },
      },
    });
    if (!existing) throw new Error("That status no longer exists");
    await requireDealWorkflow(existing.workflowId);

    const data: {
      name?: string;
      color?: string;
      kind?: string;
      canvasX?: number | null;
      canvasY?: number | null;
    } = {};
    if (input.name !== undefined) {
      const name = cleanName(input.name, "Status name");
      const clash = await prisma.workflowStatus.findFirst({
        where: { workflowId: existing.workflowId, name, NOT: { id } },
        select: { id: true },
      });
      if (clash) throw new Error(`There is already a “${name}” status`);
      data.name = name;
    }
    if (input.color !== undefined) data.color = cleanColor(input.color);
    if (input.kind !== undefined) data.kind = cleanKind(input.kind);
    if (input.canvasX !== undefined) data.canvasX = input.canvasX;
    if (input.canvasY !== undefined) data.canvasY = input.canvasY;

    const updated = await prisma.workflowStatus.update({
      where: { id },
      data,
      include: { actions: true },
    });

    revalidateWorkflow(existing.workflow.entityType, existing.workflow.projectId);
    return toStatusDTO(updated);
  });
}

export async function deleteWorkflowStatus(
  id: string,
): Promise<ActionResult<{ id: string; unassigned: number }>> {
  return wfAction("status-delete", async () => {
    const existing = await prisma.workflowStatus.findUnique({
      where: { id },
      select: {
        workflowId: true,
        workflow: { select: { entityType: true, projectId: true } },
        _count: {
          select: { deals: true, boardRecords: true, contacts: true, companies: true },
        },
      },
    });
    if (!existing) throw new Error("That status no longer exists");
    await requireDealWorkflow(existing.workflowId);

    await prisma.workflowStatus.delete({ where: { id } });
    revalidateWorkflow(existing.workflow.entityType, existing.workflow.projectId);
    return {
      id,
      unassigned:
        existing._count.deals +
        existing._count.boardRecords +
        existing._count.contacts +
        existing._count.companies,
    };
  });
}

export async function reorderWorkflowStatuses(
  workflowId: string,
  orderedIds: string[],
): Promise<ActionResult<WorkflowStatusDTO[]>> {
  return wfAction("status-reorder", async () => {
    const workflow = await requireDealWorkflow(workflowId);
    const existing = await prisma.workflowStatus.findMany({
      where: { workflowId },
      select: { id: true },
    });
    const known = new Set(existing.map((s) => s.id));
    if (
      orderedIds.length !== known.size ||
      orderedIds.some((id) => !known.has(id)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      throw new Error("The board changed — reload and try again");
    }

    await prisma.$transaction(
      planReorder(orderedIds).map((row) =>
        prisma.workflowStatus.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );

    revalidateWorkflow(workflow.entityType, workflow.projectId);
    return listWorkflowStatuses(workflowId);
  });
}

export async function createWorkflowTransition(input: {
  workflowId: string;
  name: string;
  fromStatusId: string | null;
  toStatusId: string;
  canvasX?: number | null;
  canvasY?: number | null;
}): Promise<ActionResult<WorkflowTransitionDTO>> {
  return wfAction("transition-create", async () => {
    const workflow = await requireDealWorkflow(input.workflowId);
    const name = cleanName(input.name, "Transition name");

    if (input.fromStatusId === input.toStatusId) {
      throw new Error("A transition cannot start and end on the same status");
    }

    const to = await prisma.workflowStatus.findUnique({
      where: { id: input.toStatusId },
      select: { workflowId: true },
    });
    if (!to || to.workflowId !== input.workflowId) {
      throw new Error("That destination is not on this flow");
    }
    if (input.fromStatusId) {
      const from = await prisma.workflowStatus.findUnique({
        where: { id: input.fromStatusId },
        select: { workflowId: true },
      });
      if (!from || from.workflowId !== input.workflowId) {
        throw new Error("That starting status is not on this flow");
      }
    }

    const created = await prisma.workflowTransition.create({
      data: {
        workflowId: input.workflowId,
        name,
        fromStatusId: input.fromStatusId,
        toStatusId: input.toStatusId,
        canvasX: input.canvasX ?? null,
        canvasY: input.canvasY ?? null,
      },
      include: { actions: true },
    });

    revalidateWorkflow(workflow.entityType, workflow.projectId);
    return toTransitionDTO(created);
  });
}

export async function updateWorkflowTransition(
  id: string,
  input: {
    name?: string;
    fromStatusId?: string | null;
    toStatusId?: string;
    canvasX?: number | null;
    canvasY?: number | null;
  },
): Promise<ActionResult<WorkflowTransitionDTO>> {
  return wfAction("transition-update", async () => {
    const existing = await prisma.workflowTransition.findUnique({
      where: { id },
      select: {
        workflowId: true,
        workflow: { select: { entityType: true, projectId: true } },
      },
    });
    if (!existing) throw new Error("That transition no longer exists");
    await requireDealWorkflow(existing.workflowId);

    const data: {
      name?: string;
      fromStatusId?: string | null;
      toStatusId?: string;
      canvasX?: number | null;
      canvasY?: number | null;
    } = {};
    if (input.name !== undefined) data.name = cleanName(input.name, "Transition name");
    if (input.fromStatusId !== undefined) data.fromStatusId = input.fromStatusId;
    if (input.toStatusId !== undefined) data.toStatusId = input.toStatusId;
    if (input.canvasX !== undefined) data.canvasX = input.canvasX;
    if (input.canvasY !== undefined) data.canvasY = input.canvasY;

    const updated = await prisma.workflowTransition.update({
      where: { id },
      data,
      include: { actions: true },
    });

    revalidateWorkflow(existing.workflow.entityType, existing.workflow.projectId);
    return toTransitionDTO(updated);
  });
}

export async function deleteWorkflowTransition(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return wfAction("transition-delete", async () => {
    const existing = await prisma.workflowTransition.findUnique({
      where: { id },
      select: {
        workflowId: true,
        workflow: { select: { entityType: true, projectId: true } },
      },
    });
    if (!existing) throw new Error("That transition no longer exists");
    await requireDealWorkflow(existing.workflowId);
    await prisma.workflowTransition.delete({ where: { id } });
    revalidateWorkflow(existing.workflow.entityType, existing.workflow.projectId);
    return { id };
  });
}

export async function addWorkflowAction(input: {
  transitionId?: string | null;
  statusId?: string | null;
  hook: string;
  type: string;
}): Promise<ActionResult<WorkflowActionDTO>> {
  return wfAction("action-add", async () => {
    if (!isWorkflowActionType(input.type) || !isWorkflowHook(input.hook)) {
      throw new Error("Unknown action");
    }
    assertActionAllowed(input.type, input.hook);

    let entityType = "deal";
    let projectId = "";
    if (input.transitionId) {
      const transition = await prisma.workflowTransition.findUnique({
        where: { id: input.transitionId },
        select: {
          workflowId: true,
          workflow: { select: { entityType: true, projectId: true } },
        },
      });
      if (!transition) throw new Error("That transition no longer exists");
      await requireDealWorkflow(transition.workflowId);
      entityType = transition.workflow.entityType;
      projectId = transition.workflow.projectId;
    } else if (input.statusId) {
      const status = await prisma.workflowStatus.findUnique({
        where: { id: input.statusId },
        select: {
          workflowId: true,
          workflow: { select: { entityType: true, projectId: true } },
        },
      });
      if (!status) throw new Error("That status no longer exists");
      await requireDealWorkflow(status.workflowId);
      entityType = status.workflow.entityType;
      projectId = status.workflow.projectId;
    } else {
      throw new Error("Attach the action to a status or a transition");
    }

    const last = await prisma.workflowAction.findFirst({
      where: input.transitionId
        ? { transitionId: input.transitionId }
        : { statusId: input.statusId ?? undefined },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.workflowAction.create({
      data: {
        transitionId: input.transitionId ?? null,
        statusId: input.statusId ?? null,
        hook: input.hook,
        type: input.type,
        config: stringifyActionConfig(cleanActionConfig(input.type, {})),
        position: positionBetween(last?.position ?? null, null),
      },
    });

    revalidateWorkflow(entityType, projectId);
    return toActionDTO(created);
  });
}

export async function updateWorkflowAction(
  id: string,
  input: { hook?: string; type?: string; config?: unknown },
): Promise<ActionResult<WorkflowActionDTO>> {
  return wfAction("action-update", async () => {
    const existing = await prisma.workflowAction.findUnique({
      where: { id },
      include: {
        transition: {
          select: {
            workflowId: true,
            workflow: { select: { entityType: true, projectId: true } },
          },
        },
        status: {
          select: {
            workflowId: true,
            workflow: { select: { entityType: true, projectId: true } },
          },
        },
      },
    });
    if (!existing) throw new Error("That action no longer exists");
    const parent = existing.transition ?? existing.status;
    if (parent) await requireDealWorkflow(parent.workflowId);

    const type = input.type
      ? isWorkflowActionType(input.type)
        ? input.type
        : existing.type
      : existing.type;
    const hook = input.hook
      ? isWorkflowHook(input.hook)
        ? input.hook
        : existing.hook
      : existing.hook;
    if (!isWorkflowActionType(type) || !isWorkflowHook(hook)) {
      throw new Error("Unknown action");
    }
    assertActionAllowed(type, hook);

    const config =
      input.config !== undefined
        ? stringifyActionConfig(cleanActionConfig(type, input.config))
        : existing.config;

    const updated = await prisma.workflowAction.update({
      where: { id },
      data: { type, hook, config },
    });

    const entityType =
      existing.transition?.workflow.entityType ??
      existing.status?.workflow.entityType ??
      "deal";
    const projectId =
      existing.transition?.workflow.projectId ??
      existing.status?.workflow.projectId ??
      "";
    revalidateWorkflow(entityType, projectId);
    return toActionDTO(updated);
  });
}

export type BlueprintDraft = {
  statuses: WorkflowStatusDTO[];
  transitions: WorkflowTransitionDTO[];
};

function isDraftId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith("draft:"));
}

export async function saveWorkflowBlueprint(
  workflowId: string,
  draft: BlueprintDraft,
): Promise<
  ActionResult<{
    statuses: WorkflowStatusDTO[];
    transitions: WorkflowTransitionDTO[];
    idMap: Record<string, string>;
  }>
> {
  return wfAction("blueprint-save", async () => {
    const workflow = await requireDealWorkflow(workflowId);
    const names = draft.statuses.map((s) => cleanName(s.name, "Status name"));
    const unique = new Set(names.map((n) => n.toLowerCase()));
    if (unique.size !== names.length) {
      throw new Error("Each status on a flow needs its own name");
    }

    const idMap: Record<string, string> = {};
    const remap = (id: string | null): string | null => {
      if (!id) return null;
      return idMap[id] ?? id;
    };

    await prisma.$transaction(async (tx) => {
      const existingStatuses = await tx.workflowStatus.findMany({
        where: { workflowId },
        select: { id: true },
      });
      const existingTransitions = await tx.workflowTransition.findMany({
        where: { workflowId },
        select: { id: true },
      });
      const keepStatusIds = new Set(
        draft.statuses.filter((s) => !isDraftId(s.id)).map((s) => s.id),
      );
      const keepTransitionIds = new Set(
        draft.transitions.filter((t) => !isDraftId(t.id)).map((t) => t.id),
      );

      for (const row of existingStatuses) {
        if (!keepStatusIds.has(row.id)) continue;
        await tx.workflowStatus.update({
          where: { id: row.id },
          data: { name: `__draft__${row.id.slice(-10)}` },
        });
      }

      await tx.workflowTransition.deleteMany({
        where: {
          workflowId,
          id: { in: existingTransitions.filter((t) => !keepTransitionIds.has(t.id)).map((t) => t.id) },
        },
      });
      await tx.workflowStatus.deleteMany({
        where: {
          workflowId,
          id: { in: existingStatuses.filter((s) => !keepStatusIds.has(s.id)).map((s) => s.id) },
        },
      });

      for (const [index, status] of draft.statuses.entries()) {
        const name = names[index];
        const color = cleanColor(status.color);
        const kind = cleanKind(status.kind);
        if (isDraftId(status.id)) {
          const created = await tx.workflowStatus.create({
            data: {
              workflowId,
              name,
              color,
              kind,
              position: status.position || positionBetween(null, null),
              canvasX: status.canvasX,
              canvasY: status.canvasY,
            },
          });
          idMap[status.id] = created.id;
        } else {
          await tx.workflowStatus.update({
            where: { id: status.id },
            data: {
              name,
              color,
              kind,
              position: status.position,
              canvasX: status.canvasX,
              canvasY: status.canvasY,
            },
          });
        }
      }

      for (const transition of draft.transitions) {
        const fromStatusId = remap(transition.fromStatusId);
        const toStatusId = remap(transition.toStatusId);
        if (!toStatusId || fromStatusId === toStatusId) {
          throw new Error("A transition cannot start and end on the same status");
        }
        const name = cleanName(transition.name || "Move", "Transition name");
        if (isDraftId(transition.id)) {
          const created = await tx.workflowTransition.create({
            data: {
              workflowId,
              name,
              fromStatusId,
              toStatusId,
              canvasX: transition.canvasX,
              canvasY: transition.canvasY,
            },
          });
          idMap[transition.id] = created.id;
        } else {
          await tx.workflowTransition.update({
            where: { id: transition.id },
            data: {
              name,
              fromStatusId,
              toStatusId,
              canvasX: transition.canvasX,
              canvasY: transition.canvasY,
            },
          });
        }
      }

      const parents = [
        ...draft.statuses.map((s) => ({
          statusId: remap(s.id)!,
          transitionId: null as string | null,
          actions: s.actions,
        })),
        ...draft.transitions.map((t) => ({
          statusId: null as string | null,
          transitionId: remap(t.id)!,
          actions: t.actions,
        })),
      ];

      for (const parent of parents) {
        const existing = await tx.workflowAction.findMany({
          where: parent.statusId
            ? { statusId: parent.statusId }
            : { transitionId: parent.transitionId! },
          select: { id: true },
        });
        const keep = new Set(
          parent.actions.filter((a) => !isDraftId(a.id)).map((a) => a.id),
        );
        await tx.workflowAction.deleteMany({
          where: {
            id: { in: existing.filter((a) => !keep.has(a.id)).map((a) => a.id) },
          },
        });
        for (const action of parent.actions) {
          if (!isWorkflowActionType(action.type) || !isWorkflowHook(action.hook)) {
            throw new Error("Unknown action");
          }
          assertActionAllowed(action.type, action.hook);
          const config = stringifyActionConfig(
            cleanActionConfig(action.type, action.config),
          );
          if (isDraftId(action.id)) {
            const created = await tx.workflowAction.create({
              data: {
                statusId: parent.statusId,
                transitionId: parent.transitionId,
                hook: action.hook,
                type: action.type,
                config,
                position: action.position || positionBetween(null, null),
              },
            });
            idMap[action.id] = created.id;
          } else {
            await tx.workflowAction.update({
              where: { id: action.id },
              data: {
                hook: action.hook,
                type: action.type,
                config,
                position: action.position,
              },
            });
          }
        }
      }
    });

    revalidateWorkflow(workflow.entityType, workflow.projectId);
    const [statuses, transitions] = await Promise.all([
      listWorkflowStatuses(workflowId),
      listWorkflowTransitions(workflowId),
    ]);
    return { statuses, transitions, idMap };
  });
}

export async function deleteWorkflowAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return wfAction("action-delete", async () => {
    const existing = await prisma.workflowAction.findUnique({
      where: { id },
      include: {
        transition: {
          select: {
            workflowId: true,
            workflow: { select: { entityType: true, projectId: true } },
          },
        },
        status: {
          select: {
            workflowId: true,
            workflow: { select: { entityType: true, projectId: true } },
          },
        },
      },
    });
    if (!existing) throw new Error("That action no longer exists");
    const parent = existing.transition ?? existing.status;
    if (parent) await requireDealWorkflow(parent.workflowId);
    await prisma.workflowAction.delete({ where: { id } });
    const entityType =
      existing.transition?.workflow.entityType ??
      existing.status?.workflow.entityType ??
      "deal";
    const projectId =
      existing.transition?.workflow.projectId ??
      existing.status?.workflow.projectId ??
      "";
    revalidateWorkflow(entityType, projectId);
    return { id };
  });
}
