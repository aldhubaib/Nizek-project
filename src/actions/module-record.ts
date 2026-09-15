"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { getModule } from "@/lib/modules/registry";
import { applyLayoutTextScripts } from "@/lib/fields/text-config";
import { customFieldIsFilled } from "@/lib/fields/validate";
import { fieldAppliesOnForm } from "@/lib/fields/visibility";
import { isCustomFieldType, type CustomFieldType } from "@/lib/fields/types";
import {
  RELATION_MODEL_LABEL,
  parseRelationConfig,
  parseRelationIds,
  stringifyRelationIds,
} from "@/lib/fields/relations";
import { countRelatedRecords } from "@/actions/related-records";
import {
  getCustomFieldValues,
  listCustomFields,
  saveCustomFieldValues,
} from "@/actions/custom-field";
import {
  listWorkflowUsers,
  listWorkflows,
  listWorkflowTransitions,
  type WorkflowTransitionDTO,
  type WorkflowUserOption,
} from "@/actions/workflow";
import { createAndPublishNotifications } from "@/lib/notify";
import { dispatchSendInviteActions } from "@/lib/calendar-invite-send";
import { parseActionConfig } from "@/lib/workflow/actions";
import { mergeNativeFieldValues } from "@/lib/modules/native-field-values";
import {
  deleteRecordHistory,
  logRecordChanges,
  logRecordCreated,
} from "@/lib/modules/record-history";
import { takeNextRecordNumber } from "@/lib/modules/record-number";
import { parseCountryCodes } from "@/lib/countries";
import { parsePhoneValue } from "@/lib/dial-codes";
import { isIndustry } from "@/lib/industries";
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
import type { DealDTO } from "@/actions/deal";
import type { DealFlowDTO } from "@/actions/deal-flow";
import { listDealStages, type DealStageDTO } from "@/actions/deal-stage";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { WorkflowEntityType } from "@/lib/workflow/types";

export type DirectoryEntity = "contact" | "company";

export type ModuleRecordInput = {
  title: string;
  flowId?: string | null;
  stageId?: string | null;
  fieldValues?: Record<string, string>;
};

export type ModulePipelineDTO = {
  entityType: DirectoryEntity;
  flows: DealFlowDTO[];
  flowId: string;
  stages: DealStageDTO[];
  records: DealDTO[];
  transitions: WorkflowTransitionDTO[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function namesFromTitle(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || title || "Untitled",
    lastName: parts.slice(1).join(" "),
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

function toRecord(
  row: {
    id: string;
    recordNumber: number;
    title: string;
    workflowId: string;
    statusId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  fieldValues: Record<string, string> = {},
): DealDTO {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    title: row.title,
    value: null,
    flowId: row.workflowId,
    stageId: row.statusId,
    contacts: [],
    companies: [],
    fieldValues,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function revalidateModule(entityType: DirectoryEntity) {
  for (const path of getModule(entityType).revalidatePaths) {
    revalidatePath(path);
  }
}

async function recordAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[module-record:${label}]`, err);
    return { ok: false, error };
  }
}

export async function ensureDirectoryWorkflow(entityType: DirectoryEntity) {
  await requireContactsAccess();
  const layoutName = getModule(entityType).label;
  let layout = await prisma.formLayout.findFirst({
    where: { entityType, projectId: "" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!layout) {
    layout = await prisma.formLayout.create({
      data: { entityType, projectId: "", name: layoutName, position: 1 },
      select: { id: true },
    });
    const binding = getModule(entityType).bindings[0];
    if (binding) {
      await prisma.customField.create({
        data: {
          entityType,
          layoutId: layout.id,
          key: binding.key,
          label: binding.label,
          type: binding.type,
          binding: binding.key,
          required: Boolean(binding.required),
          position: 64,
        },
      });
    }
  }

  let workflow = await prisma.workflow.findFirst({
    where: { entityType, projectId: "" },
    orderBy: { position: "asc" },
    select: { id: true, layoutId: true },
  });
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        entityType,
        projectId: "",
        name: layoutName,
        position: 1,
        layoutId: layout.id,
      },
      select: { id: true, layoutId: true },
    });
  } else if (!workflow.layoutId) {
    workflow = await prisma.workflow.update({
      where: { id: workflow.id },
      data: { layoutId: layout.id },
      select: { id: true, layoutId: true },
    });
  }

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
          kind: "open",
          position: 3072,
          canvasX: 560,
          canvasY: 80,
        },
      ],
    });
  }

  return { workflowId: workflow.id, layoutId: workflow.layoutId ?? layout.id };
}

async function requireDirectoryFlow(entityType: DirectoryEntity, workflowId: string) {
  const flow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { id: true, entityType: true, projectId: true, layoutId: true },
  });
  if (!flow || flow.entityType !== entityType || flow.projectId !== "") {
    throw new Error("That flow no longer exists");
  }
  return flow;
}

async function cleanInput(
  entityType: DirectoryEntity,
  input: ModuleRecordInput,
  mode: "create" | "edit",
) {
  let title = input.title.trim();
  if (title.length > 160) throw new Error("Keep the name under 160 characters");

  let flowId = input.flowId?.trim() || null;
  let layoutId: string | null = null;
  if (flowId) {
    const flow = await requireDirectoryFlow(entityType, flowId);
    layoutId = flow.layoutId;
  } else {
    const first = await prisma.workflow.findFirst({
      where: { entityType, projectId: "" },
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
          key: true,
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
      fieldAppliesOnForm(field, mode, fieldValues, layoutFieldIds),
    )
    .filter((field) => {
      if (field.binding === "title") return !title;
      const type = isCustomFieldType(field.type) ? field.type : "text";
      return !customFieldIsFilled(type, fieldValues[field.id]);
    })
    .map((field) => field.label);
  if (missing.length > 0) throw new Error(`Fill ${missing.join(", ")}`);
  if (!title) title = "Untitled";

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

  return { title, flowId, layoutId, stageId, fieldValues, layoutFields };
}

async function firstStageId(flowId: string) {
  const first = await prisma.workflowStatus.findFirst({
    where: { workflowId: flowId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

async function valuesByRecord(entityType: DirectoryEntity, ids: string[]) {
  if (ids.length === 0) return new Map<string, Record<string, string>>();
  const values = await prisma.customFieldValue.findMany({
    where: { entityType, recordId: { in: ids } },
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

async function layoutIdForWorkflow(workflowId: string | null | undefined) {
  if (!workflowId) return null;
  const row = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { layoutId: true },
  });
  return row?.layoutId ?? null;
}

async function layoutFieldRefs(
  entityType: DirectoryEntity,
  layoutId?: string | null,
) {
  return prisma.customField.findMany({
    where: layoutId
      ? { layoutId, binding: null }
      : { entityType, binding: null },
    select: { id: true, type: true, label: true, key: true },
  });
}

function hydrateDirectoryValues(
  entityType: DirectoryEntity,
  native: {
    website?: string | null;
    industry?: string | null;
    countries?: string[];
    email?: string | null;
    phoneCountry?: string | null;
    phoneNumber?: string | null;
  },
  fields: Awaited<ReturnType<typeof layoutFieldRefs>>,
  custom: Record<string, string>,
) {
  return mergeNativeFieldValues(entityType, native, fields, custom);
}

function nativeCompanyPatch(
  fields: { id: string; type: string; label: string; key: string }[],
  fieldValues: Record<string, string>,
) {
  const country = fields.find((field) => field.type === "country");
  const website = fields.find(
    (field) =>
      field.type === "url" || /website/i.test(field.label) || field.key === "url",
  );
  const industry = fields.find(
    (field) => /industry/i.test(field.label) || field.key === "industry",
  );
  const industryRaw = industry ? fieldValues[industry.id] ?? "" : "";
  return {
    ...(country
      ? { countries: parseCountryCodes(fieldValues[country.id] ?? "") }
      : {}),
    ...(website ? { website: fieldValues[website.id]?.trim() || null } : {}),
    ...(industry && isIndustry(industryRaw) ? { industry: industryRaw } : {}),
  };
}

function nativeContactPatch(
  fields: { id: string; type: string; label: string; key: string }[],
  fieldValues: Record<string, string>,
) {
  const phone = fields.find((field) => field.type === "phone");
  const email = fields.find(
    (field) => field.type === "email" || field.key === "email",
  );
  const parsed = phone ? parsePhoneValue(fieldValues[phone.id] ?? "") : null;
  return {
    ...(email ? { email: fieldValues[email.id]?.trim() || null } : {}),
    ...(parsed
      ? { phoneCountry: parsed.country, phoneNumber: parsed.number }
      : {}),
  };
}

export async function getDirectoryPipeline(
  entityType: DirectoryEntity,
  flowId?: string | null,
): Promise<ModulePipelineDTO> {
  await requireContactsAccess();
  const ensured = await ensureDirectoryWorkflow(entityType);
  const flows = (await listWorkflows(entityType)).map(toFlowDTO);
  const selected =
    (flowId && flows.find((flow) => flow.id === flowId)?.id) ||
    flows[0]?.id ||
    ensured.workflowId;
  const layoutId =
    flows.find((flow) => flow.id === selected)?.layoutId ?? ensured.layoutId;
  const [stages, records, transitions, users, fields] = await Promise.all([
    listDealStages(selected),
    listDirectoryRecords(entityType, selected, layoutId),
    listWorkflowTransitions(selected),
    listWorkflowUsers(),
    listCustomFields(entityType, layoutId),
  ]);
  return {
    entityType,
    flows,
    flowId: selected,
    stages,
    records,
    transitions,
    fields,
    users,
  };
}

export async function listDirectoryRecords(
  entityType: DirectoryEntity,
  flowId?: string,
  layoutId?: string | null,
): Promise<DealDTO[]> {
  await requireContactsAccess();
  if (entityType === "contact") {
    const rows = await prisma.contact.findMany({
      where: flowId ? { workflowId: flowId } : undefined,
      orderBy: { title: "asc" },
      select: {
        id: true,
        recordNumber: true,
        title: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneCountry: true,
        phoneNumber: true,
        workflowId: true,
        statusId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const [values, fields] = await Promise.all([
      valuesByRecord(entityType, rows.map((row) => row.id)),
      layoutFieldRefs(entityType, layoutId),
    ]);
    return rows.map((row) =>
      toRecord(
        {
          ...row,
          title: row.title || `${row.firstName} ${row.lastName}`.trim(),
        },
        hydrateDirectoryValues(entityType, row, fields, values.get(row.id) ?? {}),
      ),
    );
  }

  const rows = await prisma.company.findMany({
    where: flowId ? { workflowId: flowId } : undefined,
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      recordNumber: true,
      nameEn: true,
      website: true,
      industry: true,
      countries: true,
      workflowId: true,
      statusId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const [values, fields] = await Promise.all([
    valuesByRecord(entityType, rows.map((row) => row.id)),
    layoutFieldRefs(entityType, layoutId),
  ]);
  return rows.map((row) =>
    toRecord(
      { ...row, title: row.nameEn },
      hydrateDirectoryValues(entityType, row, fields, values.get(row.id) ?? {}),
    ),
  );
}

export async function getDirectoryRecord(
  entityType: DirectoryEntity,
  id: string,
): Promise<DealDTO | null> {
  await requireContactsAccess();
  if (entityType === "contact") {
    const row = await prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        recordNumber: true,
        title: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneCountry: true,
        phoneNumber: true,
        workflowId: true,
        statusId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    const [fieldValues, fields] = await Promise.all([
      getCustomFieldValues(entityType, id),
      layoutFieldRefs(entityType, await layoutIdForWorkflow(row.workflowId)),
    ]);
    return toRecord(
      {
        ...row,
        title: row.title || `${row.firstName} ${row.lastName}`.trim(),
      },
      hydrateDirectoryValues(entityType, row, fields, fieldValues),
    );
  }
  const row = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      recordNumber: true,
      nameEn: true,
      website: true,
      industry: true,
      countries: true,
      workflowId: true,
      statusId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  const [fieldValues, fields] = await Promise.all([
    getCustomFieldValues(entityType, id),
    layoutFieldRefs(entityType, await layoutIdForWorkflow(row.workflowId)),
  ]);
  return toRecord(
    { ...row, title: row.nameEn },
    hydrateDirectoryValues(entityType, row, fields, fieldValues),
  );
}

export async function createDirectoryRecord(
  entityType: DirectoryEntity,
  input: ModuleRecordInput,
): Promise<ActionResult<DealDTO>> {
  return recordAction("create", async () => {
    const user = await requireContactsAccess();
    await ensureDirectoryWorkflow(entityType);
    const data = await cleanInput(entityType, input, "create");
    const statusId = data.stageId ?? (await firstStageId(data.flowId));

    if (entityType === "contact") {
      const names = namesFromTitle(data.title);
      const created = await prisma.$transaction(async (tx) => {
        const recordNumber = await takeNextRecordNumber(tx, "contact");
        return tx.contact.create({
          data: {
            recordNumber,
            title: data.title,
            firstName: names.firstName,
            lastName: names.lastName,
            workflowId: data.flowId,
            statusId,
            createdById: user.id,
            ...nativeContactPatch(data.layoutFields, data.fieldValues),
          },
        });
      });
      await saveCustomFieldValues({
        entityType,
        recordId: created.id,
        values: data.fieldValues,
        layoutId: data.layoutId,
      });
      await logRecordCreated({
        entityType,
        recordId: created.id,
        userId: user.id,
        title: created.title,
        recordWord: "contact",
      });
      revalidateModule(entityType);
      return toRecord(created, data.fieldValues);
    }

    const clash = await prisma.company.findUnique({
      where: { nameEn: data.title },
      select: { id: true },
    });
    if (clash) throw new Error(`“${data.title}” is already in the list`);
    const created = await prisma.$transaction(async (tx) => {
      const recordNumber = await takeNextRecordNumber(tx, "company");
      return tx.company.create({
        data: {
          recordNumber,
          nameEn: data.title,
          nameAr: "",
          industry: "",
          countries: [],
          workflowId: data.flowId,
          statusId,
          createdById: user.id,
          ...nativeCompanyPatch(data.layoutFields, data.fieldValues),
        },
      });
    });
    await saveCustomFieldValues({
      entityType,
      recordId: created.id,
      values: data.fieldValues,
      layoutId: data.layoutId,
    });
    await logRecordCreated({
      entityType,
      recordId: created.id,
      userId: user.id,
      title: created.nameEn,
      recordWord: "company",
    });
    revalidateModule(entityType);
    return toRecord({ ...created, title: created.nameEn }, data.fieldValues);
  });
}

export async function updateDirectoryRecord(
  entityType: DirectoryEntity,
  id: string,
  input: ModuleRecordInput,
): Promise<ActionResult<DealDTO>> {
  return recordAction("update", async () => {
    const user = await requireContactsAccess();
    const before = await getDirectoryRecord(entityType, id);
    if (!before) throw new Error("That record no longer exists");
    const data = await cleanInput(entityType, input, "edit");

    if (entityType === "contact") {
      const names = namesFromTitle(data.title);
      const updated = await prisma.contact.update({
        where: { id },
        data: {
          title: data.title,
          firstName: names.firstName,
          lastName: names.lastName,
          ...nativeContactPatch(data.layoutFields, data.fieldValues),
        },
      });
      await saveCustomFieldValues({
        entityType,
        recordId: id,
        values: data.fieldValues,
        layoutId: data.layoutId,
      });
      await logRecordChanges({
        entityType,
        recordId: id,
        userId: user.id,
        before: {
          title: before.title,
          fieldValues: before.fieldValues,
        },
        after: {
          title: data.title,
          fieldValues: data.fieldValues,
        },
        fields: data.layoutFields,
      });
      revalidateModule(entityType);
      return toRecord(updated, data.fieldValues);
    }

    const clash = await prisma.company.findFirst({
      where: { nameEn: data.title, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new Error(`“${data.title}” is already in the list`);
    const updated = await prisma.company.update({
      where: { id },
      data: {
        nameEn: data.title,
        ...nativeCompanyPatch(data.layoutFields, data.fieldValues),
      },
    });
    await saveCustomFieldValues({
      entityType,
      recordId: id,
      values: data.fieldValues,
      layoutId: data.layoutId,
    });
    await logRecordChanges({
      entityType,
      recordId: id,
      userId: user.id,
      before: {
        title: before.title,
        fieldValues: before.fieldValues,
      },
      after: {
        title: data.title,
        fieldValues: data.fieldValues,
      },
      fields: data.layoutFields,
    });
    revalidateModule(entityType);
    return toRecord({ ...updated, title: updated.nameEn }, data.fieldValues);
  });
}

export async function deleteDirectoryRecord(
  entityType: DirectoryEntity,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return recordAction("delete", async () => {
    await requireContactsAccess();
    await deleteRecordHistory(entityType, id);
    if (entityType === "contact") {
      await prisma.contact.delete({ where: { id } });
    } else {
      await prisma.company.delete({ where: { id } });
    }
    revalidateModule(entityType);
    return { id };
  });
}

async function directorySnapshot(entityType: DirectoryEntity, recordId: string) {
  if (entityType === "contact") {
    const row = await prisma.contact.findUnique({
      where: { id: recordId },
      include: { workflow: { select: { layoutId: true, blueprintEnabled: true } } },
    });
    if (!row) throw new Error("That contact no longer exists");
    const values = await prisma.customFieldValue.findMany({
      where: { entityType, recordId },
      select: { fieldId: true, value: true },
    });
    return {
      title: row.title || `${row.firstName} ${row.lastName}`.trim(),
      workflowId: row.workflowId,
      layoutId: row.workflow.layoutId,
      blueprintEnabled: row.workflow.blueprintEnabled,
      statusId: row.statusId,
      snapshot: {
        native: {
          title: row.title || `${row.firstName} ${row.lastName}`.trim(),
          value: null,
          contactIds: [],
          companyIds: [],
        },
        custom: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
      } satisfies FieldSnapshot,
    };
  }

  const row = await prisma.company.findUnique({
    where: { id: recordId },
    include: { workflow: { select: { layoutId: true, blueprintEnabled: true } } },
  });
  if (!row) throw new Error("That company no longer exists");
  const values = await prisma.customFieldValue.findMany({
    where: { entityType, recordId },
    select: { fieldId: true, value: true },
  });
  return {
    title: row.nameEn,
    workflowId: row.workflowId,
    layoutId: row.workflow.layoutId,
    blueprintEnabled: row.workflow.blueprintEnabled,
    statusId: row.statusId,
    snapshot: {
      native: {
        title: row.nameEn,
        value: null,
        contactIds: [],
        companyIds: [],
      },
      custom: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
    } satisfies FieldSnapshot,
  };
}

export async function moveDirectoryRecord(
  entityType: DirectoryEntity,
  recordId: string,
  stageId: string | null,
  payload: DuringPayload = {},
): Promise<ActionResult<{ id: string; stageId: string | null }>> {
  try {
    const user = await requireContactsAccess();
    const loaded = await directorySnapshot(entityType, recordId);

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
      if (entityType === "contact") {
        await prisma.contact.update({
          where: { id: recordId },
          data: { statusId: stageId },
        });
      } else {
        await prisma.company.update({
          where: { id: recordId },
          data: { statusId: stageId },
        });
      }
      await logRecordChanges({
        entityType,
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
      revalidateModule(entityType);
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
          : { entityType },
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

    if (
      !isMoveAllowed({
        fromStatusId: loaded.statusId,
        toStatusId: stageId,
        transitionCount: transitions.length,
        allowedToIds: allowedDestinations(loaded.statusId, transitionDefs),
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
      if (duringErrors.length > 0) throw new Error(duringErrors.join(". "));
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
    );

    if (entityType === "contact") {
      const names = namesFromTitle(after.native.title);
      await prisma.contact.update({
        where: { id: recordId },
        data: {
          statusId: stageId,
          title: after.native.title,
          firstName: names.firstName,
          lastName: names.lastName,
        },
      });
    } else {
      await prisma.company.update({
        where: { id: recordId },
        data: { statusId: stageId, nameEn: after.native.title },
      });
    }

    await saveCustomFieldValues({
      entityType,
      recordId,
      values: after.custom,
      layoutId: loaded.layoutId,
    });

    const recipients = notifyUserIds(grouped.after);
    if (recipients.length > 0) {
      const destName = to?.name ?? "Unassigned";
      const path = getModule(entityType).recordPath;
      await createAndPublishNotifications({
        recipientIds: recipients,
        type: `${entityType}_workflow`,
        title: `${loaded.title} moved to ${destName}`,
        body: transition?.name ?? destName,
        linkUrl: `${path}/${recordId}`,
      });
    }

    await dispatchSendInviteActions({
      actions: sendInviteActionsForMove({
        fromActions: toActions(from),
        toActions: toActions(to),
        transition,
      }),
      entityType,
      recordId,
      recordTitle: after.native.title,
      fields: customFields,
      values: after.custom,
      organizer: {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
      },
      linkUrl: `${getModule(entityType).recordPath}/${recordId}`,
      layoutId: loaded.layoutId,
    });

    await logRecordChanges({
      entityType,
      recordId,
      userId: user.id,
      before: {
        title: loaded.snapshot.native.title,
        statusId: loaded.statusId,
        fieldValues: loaded.snapshot.custom,
      },
      after: {
        title: after.native.title,
        statusId: stageId,
        fieldValues: after.custom,
      },
      fields: customFields,
    });

    revalidateModule(entityType);
    return { ok: true, data: { id: recordId, stageId } };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error("[module-record:move]", err);
    return { ok: false, error };
  }
}

export async function listDirectoryFlows(entityType: DirectoryEntity) {
  await ensureDirectoryWorkflow(entityType);
  return (await listWorkflows(entityType)).map(toFlowDTO);
}
