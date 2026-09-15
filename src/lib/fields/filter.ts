/**
 * Board and list filters driven by CustomField.filterable.
 *
 * Choices are the field's pick-list options when it has them, otherwise the
 * distinct values already on loaded records. Matching is a client-side pass —
 * the pipeline already holds every card.
 */

import { countryLabel, parseCountryCodes } from "@/lib/countries";
import { formatFieldValue, type FieldDisplayContext } from "@/lib/fields/display";
import { fieldPriorityLabel } from "@/lib/fields/priority";
import { parseRelationIds } from "@/lib/fields/relations";
import { parseUserIds } from "@/lib/fields/user-config";
import { parseFieldAnswers, visibilityChoices } from "@/lib/fields/visibility";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealDTO } from "@/actions/deal";

/** Stands in for "this field has no answer", which is not a stored value. */
export const EMPTY_FIELD_FILTER = "__empty__";

const FILE_ATTACHED = "attached";

export type FieldFilterChoice = { value: string; label: string };

export function filterableFields(fields: CustomFieldDTO[]): CustomFieldDTO[] {
  return fields.filter((field) => field.filterable);
}

function pickList(field: CustomFieldDTO): boolean {
  return (
    field.type === "select" ||
    field.type === "priority" ||
    field.type === "multi_select" ||
    field.type === "checkbox"
  );
}

function tokenLabel(
  field: CustomFieldDTO,
  token: string,
  ctx: FieldDisplayContext,
): string {
  if (field.type === "file") return "Attached";
  if (field.type === "priority") return fieldPriorityLabel(token) || token;
  if (field.type === "checkbox" && (token === "true" || token === "false")) {
    return token === "true" ? "Yes" : "No";
  }
  if (field.type === "user") {
    return ctx.users.find((user) => user.id === token)?.name || token;
  }
  if (field.type === "relation") {
    const model = field.relation?.model ?? "company";
    return (ctx.related[model] ?? []).find((row) => row.id === token)?.title ?? token;
  }
  if (field.type === "country") return countryLabel(token);
  return token;
}

/** The values a record contributes to one field's filter. */
export function fieldFilterTokens(
  field: CustomFieldDTO,
  record: DealDTO,
  ctx: FieldDisplayContext,
): string[] {
  if (field.binding === "title") {
    const title = record.title.trim();
    return title ? [title] : [];
  }
  if (field.binding === "contacts") {
    return record.contacts
      .map((row) => `${row.firstName} ${row.lastName}`.trim())
      .filter(Boolean);
  }
  if (field.binding === "companies") {
    return record.companies.map((row) => row.nameEn).filter(Boolean);
  }

  const raw = record.fieldValues?.[field.id] ?? "";

  if (field.type === "user") return parseUserIds(raw);
  if (field.type === "relation") return parseRelationIds(raw);
  if (field.type === "country") return parseCountryCodes(raw);
  if (field.type === "file") return raw.trim() ? [FILE_ATTACHED] : [];
  if (pickList(field)) return parseFieldAnswers(raw);

  const formatted = formatFieldValue(field, record, ctx).trim();
  return formatted ? [formatted] : [];
}

export function recordMatchesFieldFilter(
  field: CustomFieldDTO,
  record: DealDTO,
  ctx: FieldDisplayContext,
  wanted: string,
): boolean {
  if (!wanted) return true;
  const tokens = fieldFilterTokens(field, record, ctx);
  if (wanted === EMPTY_FIELD_FILTER) return tokens.length === 0;
  return tokens.includes(wanted);
}

export function recordMatchesFieldFilters(
  record: DealDTO,
  fields: CustomFieldDTO[],
  selected: Record<string, string>,
  ctx: FieldDisplayContext,
): boolean {
  for (const field of fields) {
    if (!field.filterable) continue;
    const wanted = selected[field.id] ?? "";
    if (!recordMatchesFieldFilter(field, record, ctx, wanted)) return false;
  }
  return true;
}

export function fieldFilterChoices(
  field: CustomFieldDTO,
  records: DealDTO[],
  ctx: FieldDisplayContext,
): FieldFilterChoice[] {
  const seen = new Map<string, string>();

  function add(value: string, label: string) {
    if (!value || seen.has(value)) return;
    seen.set(value, label);
  }

  if (pickList(field)) {
    for (const choice of visibilityChoices(field)) {
      add(choice.value, choice.label);
    }
  }
  if (field.type === "file") add(FILE_ATTACHED, "Attached");

  for (const record of records) {
    for (const token of fieldFilterTokens(field, record, ctx)) {
      add(token, tokenLabel(field, token, ctx));
    }
  }

  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
}

export function activeFieldFilterCount(
  fields: CustomFieldDTO[],
  selected: Record<string, string>,
): number {
  return fields.filter((field) => field.filterable && (selected[field.id] ?? "")).length;
}
