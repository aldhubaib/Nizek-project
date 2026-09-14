import { formatDealValue } from "@/lib/deal-value";
import { formatPhoneValue } from "@/lib/dial-codes";
import { formatCountryCodes } from "@/lib/countries";
import { parseRelationIds } from "@/lib/fields/relations";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealDTO } from "@/actions/deal";
import type { RelatedRecordCatalog } from "@/lib/fields/relations";
import type { WorkflowUserOption } from "@/actions/workflow";

export type FieldDisplayContext = {
  users: WorkflowUserOption[];
  related: RelatedRecordCatalog;
};

export function formatFieldValue(
  field: CustomFieldDTO,
  record: DealDTO,
  ctx: FieldDisplayContext,
): string {
  if (field.binding === "title") return record.title;
  if (field.binding === "value") return formatDealValue(record.value);
  if (field.binding === "contacts") {
    return record.contacts
      .map((row) => `${row.firstName} ${row.lastName}`.trim())
      .filter(Boolean)
      .join(", ");
  }
  if (field.binding === "companies") {
    return record.companies.map((row) => row.nameEn).filter(Boolean).join(", ");
  }

  const raw = record.fieldValues?.[field.id] ?? "";
  if (!raw) return "";

  if (field.type === "checkbox") {
    if (raw === "true") return "Yes";
    if (raw === "false") return "No";
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string").join(", ");
      }
    } catch {
      return raw;
    }
  }

  if (field.type === "date") {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (field.type === "user") {
    return ctx.users.find((user) => user.id === raw)?.name ?? raw;
  }

  if (field.type === "relation") {
    const model = field.relation?.model ?? "company";
    const options = ctx.related[model] ?? [];
    return parseRelationIds(raw)
      .map((id) => options.find((row) => row.id === id)?.title ?? id)
      .join(", ");
  }

  if (field.type === "phone") return formatPhoneValue(raw);
  if (field.type === "country") return formatCountryCodes(raw);
  if (field.type === "file") return "Attached";
  if (field.type === "number") {
    const amount = Number(raw);
    return Number.isFinite(amount) ? formatDealValue(raw) : raw;
  }

  return raw;
}

export function fieldSortValue(
  field: CustomFieldDTO,
  record: DealDTO,
  ctx: FieldDisplayContext,
): string | number {
  if (field.binding === "value" || field.type === "number") {
    const raw =
      field.binding === "value" ? record.value : record.fieldValues?.[field.id];
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : "";
  }
  if (field.type === "date") {
    const raw = record.fieldValues?.[field.id] ?? "";
    const time = Date.parse(raw);
    return Number.isNaN(time) ? "" : time;
  }
  return formatFieldValue(field, record, ctx).toLowerCase();
}

export function compareSortValues(
  a: string | number,
  b: string | number,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  if (a === "" && b === "") return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return (
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * sign
  );
}
