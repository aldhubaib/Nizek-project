"use server";

/**
 * Configurable project Board (same engine as Deals).
 *
 * Independent of sprints: never reads or writes Task, Sprint, Stage, or the
 * sprint kanban store. Those stay on the Road map / Active sprint tabs.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import {
  getFlowPermissions,
  requireFlowAction,
  requireFlowTransition,
  seedWorkflowRolesIfMissing,
} from "@/lib/workflow-access";
import {
  canModifyNative,
  pickWritableFieldValues,
  type WorkflowPermissions,
} from "@/lib/workflow-permissions";
import { getModule, projectBoardPaths } from "@/lib/modules/registry";
import { customFieldIsFilled } from "@/lib/fields/validate";
import {
  clearHiddenFieldValues,
  fieldAppliesOnForm,
} from "@/lib/fields/visibility";
import { isCustomFieldType, type CustomFieldType } from "@/lib/fields/types";
import {
  RELATION_MODEL_LABEL,
  parseRelationConfig,
  parseRelationIds,
  stringifyRelationIds,
} from "@/lib/fields/relations";
import { countRelatedRecords } from "@/actions/related-records";
import { applyLayoutTextScripts } from "@/lib/fields/text-config";
import {
  deleteRecordHistory,
  logRecordChanges,
  logRecordCreated,
} from "@/lib/modules/record-history";
import { takeNextRecordNumber } from "@/lib/modules/record-number";
import {
  getCustomFieldValues,
  listCustomFields,
  saveCustomFieldValues,
  type CustomFieldDTO,
} from "@/actions/custom-field";
import {
  listWorkflowUsers,
  listWorkflows,
  listWorkflowTransitions,
  type WorkflowTransitionDTO,
  type WorkflowUserOption,
} from "@/actions/workflow";
import {
  createAndPublishNotifications,
} from "@/lib/notify";
import { dispatchSendInviteActions } from "@/lib/calendar-invite-send";
import { syncGoogleInviteRsvps } from "@/lib/calendar-invite-sync";
import {
  assignedUserIdFromActions,
  parseActionConfig,
} from "@/lib/workflow/actions";
import {
  actionsForMove,
  allowedDestinations,
  applySetFieldActions,
  findTransition,
  isMoveAllowed,
  missingRequiredOnSnapshot,
  notifyUserIds,
  requiredFieldIds,
  sendInviteActionsForMove,
  validateDuring,
} from "@/lib/workflow/engine";
import type { DuringPayload, FieldSnapshot } from "@/lib/workflow/types";
import type { DealDTO, RecordPersonDTO } from "@/actions/deal";
import type { DealFlowDTO } from "@/actions/deal-flow";
import {
  listDealStages,
  type DealStageDTO,
} from "@/actions/deal-stage";

const PERSON_SELECT = { id: true, name: true, imageUrl: true } as const;

export type BoardRecordDTO = {
  id: string;
  recordNumber: number;
  title: string;
  projectId: string;
  flowId: string;
  stageId: string | null;
  fieldValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy: RecordPersonDTO;
  assignee: RecordPersonDTO | null;
};

export type BoardRecordInput = {
  title: string;
  flowId?: string | null;
  stageId?: string | null;
  fieldValues?: Record<string, string>;
  assigneeId?: string | null;
};

export type ProjectBoardDTO = {
  projectId: string;
  flows: DealFlowDTO[];
  flowId: string;
  stages: DealStageDTO[];
  cards: DealDTO[];
  transitions: WorkflowTransitionDTO[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  permissions: WorkflowPermissions;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type BoardRow = {
  id: string;
  recordNumber: number;
  title: string;
  projectId: string;
  workflowId: string;
  statusId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: RecordPersonDTO;
  assignee: RecordPersonDTO | null;
};

function revalidateBoard(projectId: string) {
  for (const path of projectBoardPaths(projectId)) revalidatePath(path);
}

async function recordAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[board-record:${label}]`, err);
    return { ok: false, error };
  }
}

function boardRecordToDeal(row: BoardRecordDTO): DealDTO {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    title: row.title,
    value: null,
    flowId: row.flowId,
    stageId: row.stageId,
    contacts: [],
    companies: [],
    fieldValues: row.fieldValues,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    assignee: row.assignee,
  };
}

function toDTO(row: BoardRow, fieldValues: Record<string, string> = {}): BoardRecordDTO {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    title: row.title,
    projectId: row.projectId,
    flowId: row.workflowId,
    stageId: row.statusId,
    fieldValues,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    assignee: row.assignee,
  };
}

function toFlowDTO(row: {
  id: string;
  name: string;
  position: number;
  statusCount: number;
  recordCount: number;
  layoutId: string | null;
  blueprintEnabled: boolean;
}): DealFlowDTO {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    stageCount: row.statusCount,
    dealCount: row.recordCount,
    layoutId: row.layoutId,
    blueprintEnabled: row.blueprintEnabled,
  };
}

async function seedTitleField(layoutId: string) {
  const binding = getModule("board").bindings.find((row) => row.key === "title");
  if (!binding) return;
  const existing = await prisma.customField.findFirst({
    where: { layoutId, OR: [{ binding: "title" }, { key: "title" }] },
    select: { id: true },
  });
  if (existing) return;
  await prisma.customField.create({
    data: {
      entityType: "board",
      layoutId,
      key: binding.key,
      label: binding.label,
      type: binding.type,
      binding: binding.key,
      required: Boolean(binding.required),
      position: 64,
    },
  });
}

export async function ensureProjectBoard(projectId: string) {
  const { user } = await requireProjectMember(projectId);

  let layout = await prisma.formLayout.findFirst({
    where: { entityType: "board", projectId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  if (!layout) {
    layout = await prisma.formLayout.create({
      data: {
        entityType: "board",
        projectId,
        name: "Board",
        position: 1,
      },
      select: { id: true, name: true },
    });
  }
  await seedTitleField(layout.id);

  let workflow = await prisma.workflow.findFirst({
    where: { entityType: "board", projectId },
    orderBy: { position: "asc" },
    select: { id: true, layoutId: true },
  });
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        entityType: "board",
        projectId,
        name: "Board",
        position: 1,
        layoutId: layout.id,
      },
      select: { id: true, layoutId: true },
    });
    await seedWorkflowRolesIfMissing(workflow.id, { creatorUserId: user.id });
  } else if (!workflow.layoutId) {
    workflow = await prisma.workflow.update({
      where: { id: workflow.id },
      data: { layoutId: layout.id },
      select: { id: true, layoutId: true },
    });
  }
  await seedWorkflowRolesIfMissing(workflow.id, { existing: true });

  const statusCount = await prisma.workflowStatus.count({
    where: { workflowId: workflow.id },
  });
  if (statusCount === 0) {
    await prisma.workflowStatus.createMany({
      data: [
        {
          workflowId: workflow.id,
          name: "To do",
          color: "slate",
          kind: "open",
          position: 1024,
          canvasX: 0,
          canvasY: 80,
        },
        {
          workflowId: workflow.id,
          name: "In progress",
          color: "sky",
          kind: "open",
          position: 2048,
          canvasX: 280,
          canvasY: 80,
        },
        {
          workflowId: workflow.id,
          name: "Done",
          color: "emerald",
          kind: "closed",
          position: 3072,
          canvasX: 560,
          canvasY: 80,
        },
      ],
    });
  }

  return { workflowId: workflow.id, layoutId: workflow.layoutId ?? layout.id };
}

async function requireBoardWorkflow(projectId: string, workflowId: string) {
  const flow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { id: true, entityType: true, projectId: true, layoutId: true },
  });
  if (
    !flow ||
    flow.entityType !== "board" ||
    flow.projectId !== projectId
  ) {
    throw new Error("That flow no longer exists");
  }
  return flow;
}

async function cleanInput(
  projectId: string,
  input: BoardRecordInput,
  mode: "create" | "edit",
) {
  let title = input.title.trim();
  if (title.length > 160) throw new Error("Keep the title under 160 characters");

  let flowId = input.flowId?.trim() || null;
  let layoutId: string | null = null;
  if (flowId) {
    const flow = await requireBoardWorkflow(projectId, flowId);
    layoutId = flow.layoutId;
  } else {
    const first = await prisma.workflow.findFirst({
      where: { entityType: "board", projectId },
      orderBy: { position: "asc" },
      select: { id: true, layoutId: true },
    });
    if (!first) throw new Error("Create a task flow first");
    flowId = first.id;
    layoutId = first.layoutId;
  }

  const stageId = input.stageId?.trim() || null;
  if (stageId) {
    const stage = await prisma.workflowStatus.findUnique({
      where: { id: stageId },
      select: { workflowId: true },
    });
    if (!stage) throw new Error("That column no longer exists");
    if (flowId && stage.workflowId !== flowId) {
      throw new Error("That column is on a different flow");
    }
  }

  let fieldValues = { ...(input.fieldValues ?? {}) };
  const layoutFields = layoutId
    ? await prisma.customField.findMany({
        where: { layoutId },
        select: {
          id: true,
          label: true,
          type: true,
          showOn: true,
          required: true,
          options: true,
          binding: true,
          visibility: true,
        },
      })
    : [];
  ({ title, fieldValues } = applyLayoutTextScripts(
    layoutFields,
    title,
    fieldValues,
  ));
  const layoutFieldIds = layoutFields.map((field) => field.id);
  const missing = layoutFields
    .filter((field) => field.required)
    .filter((field) =>
      fieldAppliesOnForm(field, mode, fieldValues, layoutFieldIds, layoutFields),
    )
    .filter((field) => {
      if (field.binding === "title") return !title;
      const type = isCustomFieldType(field.type) ? field.type : "text";
      return !customFieldIsFilled(type, fieldValues[field.id]);
    })
    .map((field) => field.label);
  if (missing.length > 0) {
    throw new Error(`Fill ${missing.join(", ")}`);
  }
  if (!title) title = "Untitled";
  fieldValues = clearHiddenFieldValues(
    layoutFields,
    fieldValues,
    layoutFieldIds,
  );

  for (const field of layoutFields) {
    if (field.binding || field.type !== "relation") continue;
    const config = parseRelationConfig(field.options);
    let ids = parseRelationIds(fieldValues[field.id]);
    if (!config.multiple) ids = ids.slice(0, 1);
    const unique = [...new Set(ids)];
    if (unique.length > 0) {
      const found = await countRelatedRecords(config.model, unique);
      if (found !== unique.length) {
        throw new Error(
          `A linked ${RELATION_MODEL_LABEL[config.model].toLowerCase()} is no longer available`,
        );
      }
    }
    fieldValues[field.id] = stringifyRelationIds(unique);
  }

  const assigneeId =
    input.assigneeId === undefined
      ? undefined
      : input.assigneeId?.trim() || null;
  if (assigneeId) {
    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: assigneeId, projectId } },
      select: { userId: true },
    });
    if (!member) throw new Error("Assignee must be a project member");
  }

  return { title, flowId, layoutId, stageId, fieldValues, layoutFields, assigneeId };
}

async function firstStageId(flowId: string): Promise<string | null> {
  const first = await prisma.workflowStatus.findFirst({
    where: { workflowId: flowId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

async function valuesByRecord(ids: string[]) {
  if (ids.length === 0) return new Map<string, Record<string, string>>();
  const values = await prisma.customFieldValue.findMany({
    where: { entityType: "board", recordId: { in: ids } },
    select: { recordId: true, fieldId: true, value: true },
  });
  const byRecord = new Map<string, Record<string, string>>();
  for (const row of values) {
    const current = byRecord.get(row.recordId) ?? {};
    current[row.fieldId] = row.value;
    byRecord.set(row.recordId, current);
  }
  return byRecord;
}

export async function getProjectBoard(
  projectId: string,
  flowId?: string | null,
): Promise<ProjectBoardDTO> {
  await requireProjectMember(projectId);
  const ensured = await ensureProjectBoard(projectId);
  const flows = (await listWorkflows("board", projectId)).map(toFlowDTO);
  const selected =
    (flowId && flows.find((flow) => flow.id === flowId)?.id) ||
    flows[0]?.id ||
    ensured.workflowId;

  const layoutId =
    flows.find((flow) => flow.id === selected)?.layoutId ?? ensured.layoutId;
  const [stages, cards, transitions, users, fields, permissions] = await Promise.all([
    listDealStages(selected),
    listBoardRecords(projectId, selected),
    listWorkflowTransitions(selected),
    listWorkflowUsers(projectId),
    listCustomFields("board", layoutId, projectId),
    getFlowPermissions(selected),
  ]);

  return {
    projectId,
    flows,
    flowId: selected,
    stages,
    cards: cards.map(boardRecordToDeal),
    transitions,
    fields,
    users,
    permissions,
  };
}

export async function listBoardRecords(
  projectId: string,
  flowId?: string,
): Promise<BoardRecordDTO[]> {
  await requireProjectMember(projectId);
  const rows = await prisma.boardRecord.findMany({
    where: flowId ? { projectId, workflowId: flowId } : { projectId },
    orderBy: { title: "asc" },
    include: {
      createdBy: { select: PERSON_SELECT },
      assignee: { select: PERSON_SELECT },
    },
  });
  const values = await valuesByRecord(rows.map((row) => row.id));
  return rows.map((row) => toDTO(row, values.get(row.id) ?? {}));
}

export async function getBoardRecord(
  projectId: string,
  id: string,
): Promise<BoardRecordDTO | null> {
  const { user } = await requireProjectMember(projectId);
  const row = await prisma.boardRecord.findFirst({
    where: { id, projectId },
    include: {
      createdBy: { select: PERSON_SELECT },
      assignee: { select: PERSON_SELECT },
      workflow: { select: { layoutId: true } },
    },
  });
  if (!row) return null;
  const fieldValues = await getCustomFieldValues("board", id);
  const synced = await syncGoogleInviteRsvps({
    viewerUserId: user.id,
    entityType: "board",
    recordId: id,
    values: fieldValues,
    layoutId: row.workflow.layoutId,
  });
  return toDTO(row, synced);
}

export async function createBoardRecord(
  projectId: string,
  input: BoardRecordInput,
): Promise<ActionResult<BoardRecordDTO>> {
  return recordAction("create", async () => {
    const { user } = await requireProjectMember(projectId);
    await ensureProjectBoard(projectId);
    const data = await cleanInput(projectId, input, "create");
    await requireFlowAction(data.flowId, "createRecord");
    const created = await prisma.$transaction(async (tx) => {
      const recordNumber = await takeNextRecordNumber(tx, "board", projectId);
      return tx.boardRecord.create({
        data: {
          recordNumber,
          title: data.title,
          projectId,
          workflowId: data.flowId,
          statusId: data.stageId ?? (await firstStageId(data.flowId)),
          createdById: user.id,
          assigneeId: data.assigneeId ?? null,
        },
        include: {
          createdBy: { select: PERSON_SELECT },
          assignee: { select: PERSON_SELECT },
        },
      });
    });
    await saveCustomFieldValues({
      entityType: "board",
      recordId: created.id,
      values: data.fieldValues,
      layoutId: data.layoutId,
    });
    if (created.statusId) {
      const status = await prisma.workflowStatus.findUnique({
        where: { id: created.statusId },
        include: { actions: true },
      });
      const fields = await prisma.customField.findMany({
        where: data.layoutId
          ? { layoutId: data.layoutId }
          : { entityType: "board", layout: { projectId } },
        select: { id: true, label: true, type: true },
      });
      await dispatchSendInviteActions({
        actions: (status?.actions ?? []).map((action) => ({
          id: action.id,
          hook: action.hook as WorkflowTransitionDTO["actions"][number]["hook"],
          type: action.type as WorkflowTransitionDTO["actions"][number]["type"],
          config: parseActionConfig(action.config),
          position: action.position,
        })),
        entityType: "board",
        recordId: created.id,
        recordTitle: created.title,
        fields,
        values: data.fieldValues,
        organizer: {
          id: user.id,
          name: user.name?.trim() || user.email,
          email: user.email,
        },
        linkUrl: `/dashboard/projects/${projectId}/board/${created.id}`,
        layoutId: data.layoutId,
      });
    }
    await logRecordCreated({
      entityType: "board",
      recordId: created.id,
      userId: user.id,
      title: created.title,
      recordWord: "card",
    });
    revalidateBoard(projectId);
    return toDTO(created, data.fieldValues);
  });
}

export async function updateBoardRecord(
  projectId: string,
  id: string,
  input: BoardRecordInput,
): Promise<ActionResult<BoardRecordDTO>> {
  return recordAction("update", async () => {
    const { user } = await requireProjectMember(projectId);
    const before = await getBoardRecord(projectId, id);
    if (!before) throw new Error("That card no longer exists");
    const context = await requireFlowAction(before.flowId, "editRecord");
    const data = await cleanInput(projectId, input, "edit");
    const titleField = data.layoutFields.find((field) => field.binding === "title");
    const nextTitle = canModifyNative(
      context.permissions,
      before.stageId,
      "title",
      titleField?.id,
    )
      ? data.title
      : before.title;
    const nextAssigneeId = canModifyNative(
      context.permissions,
      before.stageId,
      "assignee",
    )
      ? data.assigneeId
      : undefined;
    const writableValues = pickWritableFieldValues(
      context.permissions,
      before.stageId,
      data.fieldValues,
    );
    const updated = await prisma.boardRecord.update({
      where: { id },
      data: {
        title: nextTitle,
        ...(nextAssigneeId !== undefined ? { assigneeId: nextAssigneeId } : {}),
      },
      include: {
        createdBy: { select: PERSON_SELECT },
        assignee: { select: PERSON_SELECT },
      },
    });
    await saveCustomFieldValues({
      entityType: "board",
      recordId: id,
      values: writableValues,
      layoutId: data.layoutId,
    });
    const afterValues = { ...before.fieldValues, ...writableValues };
    await logRecordChanges({
      entityType: "board",
      recordId: id,
      userId: user.id,
      before: {
        title: before.title,
        assigneeId: before.assignee?.id ?? null,
        fieldValues: before.fieldValues,
      },
      after: {
        title: nextTitle,
        assigneeId: updated.assignee?.id ?? null,
        fieldValues: afterValues,
      },
      fields: data.layoutFields,
    });
    revalidateBoard(projectId);
    return toDTO(updated, afterValues);
  });
}

export async function deleteBoardRecord(
  projectId: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return recordAction("delete", async () => {
    await requireProjectMember(projectId);
    const existing = await prisma.boardRecord.findFirst({
      where: { id, projectId },
      select: { id: true, workflowId: true },
    });
    if (!existing) throw new Error("That card no longer exists");
    await requireFlowAction(existing.workflowId, "deleteRecord");
    await deleteRecordHistory("board", id);
    await prisma.recordComment.deleteMany({
      where: { entityType: "board", recordId: id },
    });
    await prisma.boardRecord.delete({ where: { id } });
    revalidateBoard(projectId);
    return { id };
  });
}

async function boardSnapshot(projectId: string, recordId: string) {
  const row = await prisma.boardRecord.findFirst({
    where: { id: recordId, projectId },
    include: {
      workflow: { select: { layoutId: true, blueprintEnabled: true } },
    },
  });
  if (!row) throw new Error("That card no longer exists");

  const values = await prisma.customFieldValue.findMany({
    where: { entityType: "board", recordId },
    select: { fieldId: true, value: true },
  });

  return {
    title: row.title,
    workflowId: row.workflowId,
    layoutId: row.workflow.layoutId,
    blueprintEnabled: row.workflow.blueprintEnabled,
    statusId: row.statusId,
    assigneeId: row.assigneeId,
    snapshot: {
      native: {
        title: row.title,
        value: null,
        contactIds: [],
        companyIds: [],
      },
      custom: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
    } satisfies FieldSnapshot,
  };
}

export async function moveBoardRecordToStage(
  projectId: string,
  recordId: string,
  stageId: string | null,
  payload: DuringPayload = {},
): Promise<ActionResult<{ id: string; stageId: string | null }>> {
  try {
    const { user } = await requireProjectMember(projectId);
    const loaded = await boardSnapshot(projectId, recordId);
    await requireFlowTransition(loaded.workflowId, loaded.statusId, stageId);

    if (stageId) {
      const target = await prisma.workflowStatus.findUnique({
        where: { id: stageId },
        select: { id: true, workflowId: true },
      });
      if (!target) throw new Error("That column no longer exists");
      if (target.workflowId !== loaded.workflowId) {
        throw new Error("That column is on a different flow");
      }
    }

    if (!loaded.blueprintEnabled) {
      await prisma.boardRecord.update({
        where: { id: recordId },
        data: { statusId: stageId },
      });
      await logRecordChanges({
        entityType: "board",
        recordId,
        userId: user.id,
        before: {
          title: loaded.title,
          statusId: loaded.statusId,
          fieldValues: loaded.snapshot.custom,
        },
        after: {
          title: loaded.title,
          statusId: stageId,
          fieldValues: loaded.snapshot.custom,
        },
        fields: [],
      });
      revalidateBoard(projectId);
      return { ok: true, data: { id: recordId, stageId } };
    }

    const [statuses, transitions, customFields] = await Promise.all([
      prisma.workflowStatus.findMany({
        where: { workflowId: loaded.workflowId },
        include: { actions: true },
      }),
      prisma.workflowTransition.findMany({
        where: { workflowId: loaded.workflowId },
        include: { actions: true },
      }),
      prisma.customField.findMany({
        where: loaded.layoutId
          ? { layoutId: loaded.layoutId }
          : { entityType: "board", layout: { projectId } },
        select: { id: true, label: true, type: true, visibility: true },
      }),
    ]);

    const transitionDefs = transitions.map((t) => ({
      id: t.id,
      workflowId: t.workflowId,
      name: t.name,
      fromStatusId: t.fromStatusId,
      toStatusId: t.toStatusId,
      canvasX: t.canvasX,
      canvasY: t.canvasY,
      actions: t.actions.map((a) => ({
        id: a.id,
        hook: a.hook as WorkflowTransitionDTO["actions"][number]["hook"],
        type: a.type as WorkflowTransitionDTO["actions"][number]["type"],
        config: parseActionConfig(a.config),
        position: a.position,
      })),
    }));

    const allowedToIds = allowedDestinations(loaded.statusId, transitionDefs);
    if (
      !isMoveAllowed({
        fromStatusId: loaded.statusId,
        toStatusId: stageId,
        transitionCount: transitions.length,
        allowedToIds,
        enabled: loaded.blueprintEnabled,
      })
    ) {
      throw new Error("The blueprint does not allow that move");
    }

    const from = statuses.find((s) => s.id === loaded.statusId);
    const to = statuses.find((s) => s.id === stageId);
    const toActions = (row: (typeof statuses)[number] | undefined) =>
      (row?.actions ?? []).map((a) => ({
        id: a.id,
        hook: a.hook as WorkflowTransitionDTO["actions"][number]["hook"],
        type: a.type as WorkflowTransitionDTO["actions"][number]["type"],
        config: parseActionConfig(a.config),
        position: a.position,
      }));

    const transition = findTransition(loaded.statusId, stageId, transitionDefs);
    const grouped = actionsForMove({
      fromActions: toActions(from),
      toActions: toActions(to),
      transition,
    });

    const fieldLookup = customFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: (isCustomFieldType(f.type) ? f.type : "text") as CustomFieldType,
      visibility: f.visibility,
    }));

    if (loaded.statusId && stageId && loaded.statusId !== stageId) {
      const beforeMissing = missingRequiredOnSnapshot(
        loaded.snapshot,
        requiredFieldIds(grouped.before),
        fieldLookup,
      );
      if (beforeMissing.length > 0) {
        throw new Error(
          `Fill ${beforeMissing.join(", ")} before leaving ${from?.name ?? "this status"}`,
        );
      }

      const duringErrors = validateDuring(
        grouped.during,
        loaded.snapshot,
        payload,
        fieldLookup,
      );
      if (duringErrors.length > 0) {
        throw new Error(duringErrors.join(". "));
      }
    }

    const merged: FieldSnapshot = {
      native: {
        title: payload.nativePatches?.title ?? loaded.snapshot.native.title,
        value: loaded.snapshot.native.value,
        contactIds: loaded.snapshot.native.contactIds,
        companyIds: loaded.snapshot.native.companyIds,
      },
      custom: { ...loaded.snapshot.custom, ...payload.customValues },
    };
    const after = applySetFieldActions(
      [...grouped.before, ...grouped.after],
      merged,
      fieldLookup,
    );
    const assignedId = assignedUserIdFromActions(grouped.after, user.id);
    if (assignedId) {
      const member = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: assignedId, projectId } },
        select: { userId: true },
      });
      if (!member) throw new Error("Assignee must be a project member");
    }

    await prisma.boardRecord.update({
      where: { id: recordId },
      data: {
        statusId: stageId,
        title: after.native.title,
        ...(assignedId !== undefined ? { assigneeId: assignedId || null } : {}),
      },
    });

    await saveCustomFieldValues({
      entityType: "board",
      recordId,
      values: after.custom,
      layoutId: loaded.layoutId,
    });

    const recipients = notifyUserIds(grouped.after);
    if (recipients.length > 0) {
      const destName = to?.name ?? "Unassigned";
      await createAndPublishNotifications({
        recipientIds: recipients,
        type: "board_workflow",
        title: `${loaded.title} moved to ${destName}`,
        body: transition?.name ?? destName,
        linkUrl: `/dashboard/projects/${projectId}/board/${recordId}`,
      });
    }

    await dispatchSendInviteActions({
      actions: sendInviteActionsForMove({
        fromActions: toActions(from),
        toActions: toActions(to),
        transition,
      }),
      entityType: "board",
      recordId,
      recordTitle: after.native.title,
      fields: customFields,
      values: after.custom,
      organizer: {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      },
      linkUrl: `/dashboard/projects/${projectId}/board/${recordId}`,
      layoutId: loaded.layoutId,
    });

    await logRecordChanges({
      entityType: "board",
      recordId,
      userId: user.id,
      before: {
        title: loaded.snapshot.native.title,
        statusId: loaded.statusId,
        assigneeId: loaded.assigneeId,
        fieldValues: loaded.snapshot.custom,
      },
      after: {
        title: after.native.title,
        statusId: stageId,
        assigneeId:
          assignedId !== undefined ? assignedId || null : loaded.assigneeId,
        fieldValues: after.custom,
      },
      fields: customFields,
    });

    revalidateBoard(projectId);
    return { ok: true, data: { id: recordId, stageId } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error("[board-record:move]", err);
    return { ok: false, error };
  }
}
