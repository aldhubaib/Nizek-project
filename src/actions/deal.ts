"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { getCustomFieldValues, saveCustomFieldValues } from "@/actions/custom-field";
import { customFieldIsFilled } from "@/lib/fields/validate";
import {
  clearHiddenFieldValues,
  fieldAppliesOnForm,
} from "@/lib/fields/visibility";
import { isCustomFieldType } from "@/lib/fields/types";
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

export type DealContactDTO = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCountry: string;
  phoneNumber: string;
};

export type DealCompanyDTO = {
  id: string;
  nameEn: string;
  nameAr: string;
  website: string | null;
  industry: string;
};

export type RecordPersonDTO = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

export type DealDTO = {
  id: string;
  recordNumber: number;
  title: string;
  /** Decimal as a string so 1.10 stays 1.10 across the wire. */
  value: string | null;
  flowId: string;
  stageId: string | null;
  contacts: DealContactDTO[];
  companies: DealCompanyDTO[];
  fieldValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy?: RecordPersonDTO;
  assignee?: RecordPersonDTO | null;
};

export type DealInput = {
  title: string;
  value?: string | null;
  flowId?: string | null;
  stageId?: string | null;
  contactIds?: string[];
  companyIds?: string[];
  fieldValues?: Record<string, string>;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const DEAL_INCLUDE = {
  contacts: {
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneCountry: true,
          phoneNumber: true,
        },
      },
    },
  },
  companies: {
    include: {
      company: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          website: true,
          industry: true,
        },
      },
    },
  },
} as const;

type DealRow = {
  id: string;
  recordNumber: number;
  title: string;
  value: { toString(): string } | null;
  workflowId: string;
  statusId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contacts: { contact: DealContactDTO }[];
  companies: { company: DealCompanyDTO }[];
};

function toDTO(row: DealRow, fieldValues: Record<string, string> = {}): DealDTO {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    title: row.title,
    value: row.value ? row.value.toString() : null,
    flowId: row.workflowId,
    stageId: row.statusId,
    contacts: row.contacts.map((link) => link.contact),
    companies: row.companies.map((link) => link.company),
    fieldValues,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function dealAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[deals:${label}]`, err);
    return { ok: false, error };
  }
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

function cleanValue(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  // Commas are thousands separators people type, not decimals here — 1,250
  // should mean one thousand two hundred and fifty.
  const normalised = text.replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,3})?$/.test(normalised)) {
    throw new Error("Value has to be a number");
  }
  const amount = Number(normalised);
  if (!Number.isFinite(amount)) throw new Error("Value has to be a number");
  if (amount < 0) throw new Error("Value cannot be negative");
  return normalised;
}

async function cleanInput(input: DealInput, mode: "create" | "edit") {
  let title = input.title.trim();
  if (title.length > 160) throw new Error("Keep the title under 160 characters");

  let flowId = input.flowId?.trim() || null;
  let layoutId: string | null = null;
  if (flowId) {
    const flow = await prisma.workflow.findUnique({
      where: { id: flowId },
      select: { id: true, entityType: true, layoutId: true },
    });
    if (!flow || flow.entityType !== "deal") {
      throw new Error("That flow no longer exists");
    }
    layoutId = flow.layoutId;
  } else {
    const first = await prisma.workflow.findFirst({
      where: { entityType: "deal" },
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

  const contactIds = uniqueIds(input.contactIds);
  if (contactIds.length > 0) {
    const found = await prisma.contact.count({
      where: { id: { in: contactIds } },
    });
    if (found !== contactIds.length) {
      throw new Error("A contact you picked is no longer in the directory");
    }
  }

  const companyIds = uniqueIds(input.companyIds);
  if (companyIds.length > 0) {
    const found = await prisma.company.count({
      where: { id: { in: companyIds } },
    });
    if (found !== companyIds.length) {
      throw new Error("A company you picked is no longer in the list");
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
      fieldAppliesOnForm(field, mode, fieldValues, layoutFieldIds),
    )
    .filter((field) => {
      if (field.binding === "title") return !title;
      if (field.binding === "value") return !input.value?.trim();
      if (field.binding === "contacts") return contactIds.length === 0;
      if (field.binding === "companies") return companyIds.length === 0;
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

  return {
    title,
    value: cleanValue(input.value),
    flowId,
    layoutId,
    stageId,
    contactIds,
    companyIds,
    fieldValues,
    layoutFields,
  };
}

async function firstFlowId(): Promise<string> {
  const first = await prisma.workflow.findFirst({
    where: { entityType: "deal" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!first) throw new Error("Create a task flow first");
  return first.id;
}

async function firstStageId(flowId: string): Promise<string | null> {
  const first = await prisma.workflowStatus.findFirst({
    where: { workflowId: flowId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

function relatedWrites(contactIds: string[], companyIds: string[]) {
  return {
    contacts: { create: contactIds.map((contactId) => ({ contactId })) },
    companies: { create: companyIds.map((companyId) => ({ companyId })) },
  };
}

export async function listDeals(flowId?: string): Promise<DealDTO[]> {
  await requireContactsAccess();
  const rows = await prisma.deal.findMany({
    where: flowId ? { workflowId: flowId } : undefined,
    include: DEAL_INCLUDE,
    orderBy: { title: "asc" },
  });
  const values = await prisma.customFieldValue.findMany({
    where: {
      entityType: "deal",
      recordId: { in: rows.map((r) => r.id) },
    },
    select: { recordId: true, fieldId: true, value: true },
  });
  const byRecord = new Map<string, Record<string, string>>();
  for (const row of values) {
    const current = byRecord.get(row.recordId) ?? {};
    current[row.fieldId] = row.value;
    byRecord.set(row.recordId, current);
  }
  return rows.map((row) => toDTO(row, byRecord.get(row.id) ?? {}));
}

export async function getDeal(id: string): Promise<DealDTO | null> {
  await requireContactsAccess();
  const row = await prisma.deal.findUnique({
    where: { id },
    include: DEAL_INCLUDE,
  });
  if (!row) return null;
  const fieldValues = await getCustomFieldValues("deal", id);
  return toDTO(row, fieldValues);
}

export async function createDeal(
  input: DealInput,
): Promise<ActionResult<DealDTO>> {
  return dealAction("create", async () => {
    const user = await requireContactsAccess();
    const data = await cleanInput(input, "create");

    const flowId = data.flowId ?? (await firstFlowId());
    const created = await prisma.$transaction(async (tx) => {
      const recordNumber = await takeNextRecordNumber(tx, "deal");
      return tx.deal.create({
        data: {
          recordNumber,
          title: data.title,
          value: data.value,
          workflowId: flowId,
          statusId: data.stageId ?? (await firstStageId(flowId)),
          createdById: user.id,
          ...relatedWrites(data.contactIds, data.companyIds),
        },
        include: DEAL_INCLUDE,
      });
    });

    await saveCustomFieldValues({
      entityType: "deal",
      recordId: created.id,
      values: data.fieldValues,
      layoutId: data.layoutId,
    });
    await logRecordCreated({
      entityType: "deal",
      recordId: created.id,
      userId: user.id,
      title: created.title,
      recordWord: "deal",
    });

    revalidatePath("/dashboard/deals");
    return toDTO(created, data.fieldValues);
  });
}

export async function updateDeal(
  id: string,
  input: DealInput,
): Promise<ActionResult<DealDTO>> {
  return dealAction("update", async () => {
    const user = await requireContactsAccess();
    const before = await getDeal(id);
    if (!before) throw new Error("That deal no longer exists");
    const data = await cleanInput(input, "edit");

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        title: data.title,
        value: data.value,
        // Editing never moves the deal between columns: the board is where
        // that happens. Stage is only written on create.
        contacts: {
          deleteMany: {},
          create: data.contactIds.map((contactId) => ({ contactId })),
        },
        companies: {
          deleteMany: {},
          create: data.companyIds.map((companyId) => ({ companyId })),
        },
      },
      include: DEAL_INCLUDE,
    });

    await saveCustomFieldValues({
      entityType: "deal",
      recordId: id,
      values: data.fieldValues,
      layoutId: data.layoutId,
    });
    await logRecordChanges({
      entityType: "deal",
      recordId: id,
      userId: user.id,
      before: {
        title: before.title,
        value: before.value,
        contactIds: before.contacts.map((row) => row.id),
        companyIds: before.companies.map((row) => row.id),
        fieldValues: before.fieldValues,
      },
      after: {
        title: data.title,
        value: data.value,
        contactIds: data.contactIds,
        companyIds: data.companyIds,
        fieldValues: data.fieldValues,
      },
      fields: data.layoutFields,
    });

    revalidatePath("/dashboard/deals");
    return toDTO(updated, data.fieldValues);
  });
}

export async function deleteDeal(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return dealAction("delete", async () => {
    await requireContactsAccess();
    await deleteRecordHistory("deal", id);
    await prisma.deal.delete({ where: { id } });
    revalidatePath("/dashboard/deals");
    return { id };
  });
}
