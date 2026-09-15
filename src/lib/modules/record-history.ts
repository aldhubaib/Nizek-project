import { prisma } from "@/lib/prisma";
import { formatDealValue } from "@/lib/deal-value";
import { formatPhoneValue } from "@/lib/dial-codes";
import { formatCountryCodes } from "@/lib/countries";
import { fieldPriorityLabel } from "@/lib/fields/priority";
import { formatCostFieldDetail } from "@/lib/fields/cost";
import { formatArticleFieldDetail } from "@/lib/fields/article";
import { formatInviteFieldDetail, parseInviteValue } from "@/lib/fields/invite";
import { parseUserIds } from "@/lib/fields/user-config";
import {
  parseRelationConfig,
  parseRelationIds,
  type RelationModel,
} from "@/lib/fields/relations";
import type { WorkflowEntityType } from "@/lib/workflow/types";

export const RECORD_CREATED_KEY = "_created";

export type HistoryFieldDef = {
  id: string;
  label: string;
  type: string;
  binding?: string | null;
  options?: string | null;
};

export type RecordHistorySnapshot = {
  title: string;
  value?: string | null;
  statusId?: string | null;
  assigneeId?: string | null;
  contactIds?: string[];
  companyIds?: string[];
  fieldValues: Record<string, string>;
};

export type RecordHistoryChange = {
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
};

export type RecordHistoryUser = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type RecordHistoryEntry = {
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
};

export type RecordHistoryBatch = {
  id: string;
  createdAt: string;
  user: RecordHistoryUser;
  kind: "created" | "updated";
  changes: RecordHistoryEntry[];
};

function same(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim() === (b ?? "").trim();
}

function pushChange(
  changes: RecordHistoryChange[],
  fieldKey: string,
  fieldLabel: string,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
) {
  const from = oldValue?.trim() || null;
  const to = newValue?.trim() || null;
  if (same(from, to)) return;
  changes.push({ fieldKey, fieldLabel, oldValue: from, newValue: to });
}

function formatPlain(type: string, raw: string): string {
  if (!raw) return "";
  if (type === "phone") return formatPhoneValue(raw);
  if (type === "country") return formatCountryCodes(raw);
  if (type === "checkbox") {
    if (raw === "true") return "Yes";
    if (raw === "false") return "No";
    return raw;
  }
  if (type === "date") {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (type === "file") return "Attached";
  if (type === "priority") return fieldPriorityLabel(raw);
  if (type === "cost") return formatCostFieldDetail(raw);
  if (type === "invite") return formatInviteFieldDetail(raw);
  if (type === "article") return formatArticleFieldDetail(raw);
  if (type === "number") {
    const amount = Number(raw);
    return Number.isFinite(amount) ? formatDealValue(raw) : raw;
  }
  return raw;
}

type TitleMaps = Record<RelationModel, Map<string, string>>;

function emptyTitleMaps(): TitleMaps {
  return {
    user: new Map(),
    contact: new Map(),
    company: new Map(),
    deal: new Map(),
  };
}

function collectIds(target: Set<string>, ids: string[]) {
  for (const id of ids) if (id) target.add(id);
}

function joinTitles(map: Map<string, string>, ids: string[]) {
  return ids.map((id) => map.get(id) ?? id).join(", ");
}

async function loadTitleMaps(groups: Record<RelationModel, string[]>): Promise<TitleMaps> {
  const maps = emptyTitleMaps();
  const [users, contacts, companies, deals] = await Promise.all([
    groups.user.length
      ? prisma.user.findMany({
          where: { id: { in: groups.user } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    groups.contact.length
      ? prisma.contact.findMany({
          where: { id: { in: groups.contact } },
          select: { id: true, title: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    groups.company.length
      ? prisma.company.findMany({
          where: { id: { in: groups.company } },
          select: { id: true, nameEn: true },
        })
      : Promise.resolve([]),
    groups.deal.length
      ? prisma.deal.findMany({
          where: { id: { in: groups.deal } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  for (const row of users) maps.user.set(row.id, row.name?.trim() || row.email);
  for (const row of contacts) {
    maps.contact.set(
      row.id,
      row.title || `${row.firstName} ${row.lastName}`.trim() || row.id,
    );
  }
  for (const row of companies) maps.company.set(row.id, row.nameEn);
  for (const row of deals) maps.deal.set(row.id, row.title);
  return maps;
}

function displayHistoryValue(
  field: HistoryFieldDef,
  raw: string | null | undefined,
  maps: TitleMaps,
): string {
  const value = raw ?? "";
  if (!value) return "";
  if (field.type === "user") {
    return parseUserIds(value)
      .map((id) => maps.user.get(id) ?? id)
      .join(", ");
  }
  if (field.type === "invite") {
    const invite = parseInviteValue(value);
    const names = invite.attendees.map((row) => {
      const map = row.kind === "user" ? maps.user : maps.contact;
      return map.get(row.id) ?? row.id;
    });
    const when = formatInviteFieldDetail(value);
    return names.length ? `${when} (${names.join(", ")})` : when;
  }
  if (field.type === "relation") {
    const config = parseRelationConfig(field.options);
    return joinTitles(maps[config.model], parseRelationIds(value));
  }
  return formatPlain(field.type, value);
}

async function statusNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>([["", "Unassigned"]]);
  if (unique.length === 0) return map;
  const rows = await prisma.workflowStatus.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

function statusLabel(
  names: Map<string, string>,
  id: string | null | undefined,
) {
  if (!id) return "Unassigned";
  return names.get(id) ?? "Unassigned";
}

export async function writeRecordHistory(input: {
  entityType: WorkflowEntityType;
  recordId: string;
  userId: string;
  changes: RecordHistoryChange[];
}) {
  const changes = input.changes.filter(
    (change) => !same(change.oldValue, change.newValue),
  );
  if (changes.length === 0) return;
  const batchId = crypto.randomUUID();
  await prisma.recordHistory.createMany({
    data: changes.map((change) => ({
      entityType: input.entityType,
      recordId: input.recordId,
      batchId,
      fieldKey: change.fieldKey,
      fieldLabel: change.fieldLabel,
      oldValue: change.oldValue,
      newValue: change.newValue,
      userId: input.userId,
    })),
  });
}

export async function logRecordCreated(input: {
  entityType: WorkflowEntityType;
  recordId: string;
  userId: string;
  title: string;
  recordWord: string;
}) {
  await writeRecordHistory({
    entityType: input.entityType,
    recordId: input.recordId,
    userId: input.userId,
    changes: [
      {
        fieldKey: RECORD_CREATED_KEY,
        fieldLabel: input.recordWord,
        oldValue: null,
        newValue: input.title,
      },
    ],
  });
}

export async function logRecordChanges(input: {
  entityType: WorkflowEntityType;
  recordId: string;
  userId: string;
  before: RecordHistorySnapshot;
  after: RecordHistorySnapshot;
  fields: HistoryFieldDef[];
}) {
  const titleLabel =
    input.fields.find((field) => field.binding === "title")?.label ?? "Name";
  const valueLabel =
    input.fields.find((field) => field.binding === "value")?.label ?? "Value";
  const contactsLabel =
    input.fields.find((field) => field.binding === "contacts")?.label ??
    "Contacts";
  const companiesLabel =
    input.fields.find((field) => field.binding === "companies")?.label ??
    "Companies";

  const userIds = new Set<string>();
  if (input.before.assigneeId) userIds.add(input.before.assigneeId);
  if (input.after.assigneeId) userIds.add(input.after.assigneeId);
  const contactIds = new Set([
    ...(input.before.contactIds ?? []),
    ...(input.after.contactIds ?? []),
  ]);
  const companyIds = new Set([
    ...(input.before.companyIds ?? []),
    ...(input.after.companyIds ?? []),
  ]);
  const dealIds = new Set<string>();

  for (const field of input.fields) {
    if (field.binding) continue;
    const beforeRaw = input.before.fieldValues[field.id] ?? "";
    const afterRaw = input.after.fieldValues[field.id] ?? "";
    if (same(beforeRaw, afterRaw)) continue;
    if (field.type === "user") {
      collectIds(userIds, parseUserIds(beforeRaw));
      collectIds(userIds, parseUserIds(afterRaw));
    }
    if (field.type === "invite") {
      for (const raw of [beforeRaw, afterRaw]) {
        for (const attendee of parseInviteValue(raw).attendees) {
          if (attendee.kind === "user") userIds.add(attendee.id);
          else contactIds.add(attendee.id);
        }
      }
    }
    if (field.type === "relation") {
      const model = parseRelationConfig(field.options).model;
      const bucket =
        model === "user"
          ? userIds
          : model === "contact"
            ? contactIds
            : model === "company"
              ? companyIds
              : dealIds;
      collectIds(bucket, parseRelationIds(beforeRaw));
      collectIds(bucket, parseRelationIds(afterRaw));
    }
  }

  const [maps, names] = await Promise.all([
    loadTitleMaps({
      user: [...userIds],
      contact: [...contactIds],
      company: [...companyIds],
      deal: [...dealIds],
    }),
    statusNames([input.before.statusId, input.after.statusId]),
  ]);

  const changes: RecordHistoryChange[] = [];
  pushChange(changes, "title", titleLabel, input.before.title, input.after.title);
  pushChange(
    changes,
    "value",
    valueLabel,
    formatDealValue(input.before.value),
    formatDealValue(input.after.value),
  );

  if (
    input.before.statusId !== undefined ||
    input.after.statusId !== undefined
  ) {
    pushChange(
      changes,
      "status",
      "Status",
      statusLabel(names, input.before.statusId),
      statusLabel(names, input.after.statusId),
    );
  }

  if (input.before.contactIds || input.after.contactIds) {
    pushChange(
      changes,
      "contacts",
      contactsLabel,
      joinTitles(maps.contact, input.before.contactIds ?? []),
      joinTitles(maps.contact, input.after.contactIds ?? []),
    );
  }
  if (
    input.before.assigneeId !== undefined ||
    input.after.assigneeId !== undefined
  ) {
    pushChange(
      changes,
      "assignee",
      "Assignee",
      input.before.assigneeId
        ? (maps.user.get(input.before.assigneeId) ?? "Someone")
        : "",
      input.after.assigneeId
        ? (maps.user.get(input.after.assigneeId) ?? "Someone")
        : "",
    );
  }

  if (input.before.companyIds || input.after.companyIds) {
    pushChange(
      changes,
      "companies",
      companiesLabel,
      joinTitles(maps.company, input.before.companyIds ?? []),
      joinTitles(maps.company, input.after.companyIds ?? []),
    );
  }

  for (const field of input.fields) {
    if (field.binding) continue;
    const beforeRaw = input.before.fieldValues[field.id] ?? "";
    const afterRaw = input.after.fieldValues[field.id] ?? "";
    if (same(beforeRaw, afterRaw)) continue;
    pushChange(
      changes,
      field.id,
      field.label,
      displayHistoryValue(field, beforeRaw, maps),
      displayHistoryValue(field, afterRaw, maps),
    );
  }

  await writeRecordHistory({
    entityType: input.entityType,
    recordId: input.recordId,
    userId: input.userId,
    changes,
  });
}

export async function deleteRecordHistory(
  entityType: WorkflowEntityType,
  recordId: string,
) {
  await prisma.recordHistory.deleteMany({ where: { entityType, recordId } });
}

function personName(user: {
  name: string | null;
  email: string;
}): string {
  return user.name?.trim() || user.email;
}

function toUser(user: {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}): RecordHistoryUser {
  return {
    id: user.id,
    name: personName(user),
    imageUrl: user.imageUrl,
  };
}

function groupBatches(
  rows: {
    batchId: string;
    createdAt: Date;
    fieldKey: string;
    fieldLabel: string;
    oldValue: string | null;
    newValue: string | null;
    user: {
      id: string;
      name: string | null;
      email: string;
      imageUrl: string | null;
    };
  }[],
): RecordHistoryBatch[] {
  const batches = new Map<string, RecordHistoryBatch>();
  for (const row of rows) {
    const existing = batches.get(row.batchId);
    const change = {
      fieldKey: row.fieldKey,
      fieldLabel: row.fieldLabel,
      oldValue: row.oldValue,
      newValue: row.newValue,
    };
    if (existing) {
      existing.changes.push(change);
      if (row.fieldKey === RECORD_CREATED_KEY) existing.kind = "created";
      continue;
    }
    batches.set(row.batchId, {
      id: row.batchId,
      createdAt: row.createdAt.toISOString(),
      user: toUser(row.user),
      kind: row.fieldKey === RECORD_CREATED_KEY ? "created" : "updated",
      changes: [change],
    });
  }
  return [...batches.values()];
}

async function createdFallback(
  entityType: WorkflowEntityType,
  recordId: string,
): Promise<RecordHistoryBatch | null> {
  const select = {
    createdAt: true,
    createdBy: {
      select: { id: true, name: true, email: true, imageUrl: true },
    },
  } as const;

  let row: {
    createdAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
      imageUrl: string | null;
    };
  } | null = null;

  if (entityType === "deal") {
    row = await prisma.deal.findUnique({ where: { id: recordId }, select });
  } else if (entityType === "contact") {
    row = await prisma.contact.findUnique({ where: { id: recordId }, select });
  } else if (entityType === "company") {
    row = await prisma.company.findUnique({ where: { id: recordId }, select });
  } else {
    row = await prisma.boardRecord.findUnique({
      where: { id: recordId },
      select,
    });
  }
  if (!row) return null;
  return {
    id: "created",
    createdAt: row.createdAt.toISOString(),
    user: toUser(row.createdBy),
    kind: "created",
    changes: [
      {
        fieldKey: RECORD_CREATED_KEY,
        fieldLabel: "Record",
        oldValue: null,
        newValue: null,
      },
    ],
  };
}

export async function loadRecordHistory(
  entityType: WorkflowEntityType,
  recordId: string,
): Promise<RecordHistoryBatch[]> {
  const rows = await prisma.recordHistory.findMany({
    where: { entityType, recordId },
    orderBy: { createdAt: "desc" },
    select: {
      batchId: true,
      createdAt: true,
      fieldKey: true,
      fieldLabel: true,
      oldValue: true,
      newValue: true,
      user: {
        select: { id: true, name: true, email: true, imageUrl: true },
      },
    },
  });
  const batches = groupBatches(rows);
  if (batches.some((batch) => batch.kind === "created")) return batches;
  const created = await createdFallback(entityType, recordId);
  return created ? [...batches, created] : batches;
}
