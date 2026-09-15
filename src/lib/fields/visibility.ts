/**
 * Conditional field visibility: show a field only when a sibling pick list
 * (or checkbox) holds one of the listed values.
 *
 * Stored on CustomField.visibility as `{ dependsOn: fieldId, values: string[] }`.
 */

import { FIELD_PRIORITY_CHOICES } from "@/lib/fields/priority";

export type FieldVisibility = {
  dependsOn: string;
  values: string[];
};

export function parseFieldVisibility(
  raw: string | FieldVisibility | null | undefined,
): FieldVisibility | null {
  if (!raw) return null;
  if (typeof raw === "object") {
    return normalizeVisibility(raw.dependsOn, raw.values);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as { dependsOn?: unknown; values?: unknown };
    const values = Array.isArray(obj.values)
      ? obj.values.filter((item): item is string => typeof item === "string")
      : [];
    return normalizeVisibility(
      typeof obj.dependsOn === "string" ? obj.dependsOn : "",
      values,
    );
  } catch {
    return null;
  }
}

export function stringifyFieldVisibility(
  rule: FieldVisibility | null | undefined,
): string | null {
  const normalized = rule
    ? normalizeVisibility(rule.dependsOn, rule.values)
    : null;
  return normalized ? JSON.stringify(normalized) : null;
}

export function canControlVisibility(field: {
  type: string;
  binding?: string | null;
}): boolean {
  if (field.binding) return false;
  return (
    field.type === "select" ||
    field.type === "priority" ||
    field.type === "multi_select" ||
    field.type === "checkbox"
  );
}

export function visibilityChoices(field: {
  type: string;
  options: string[];
}): { value: string; label: string }[] {
  if (field.type === "priority") return FIELD_PRIORITY_CHOICES;
  if (field.type === "checkbox" && field.options.length === 0) {
    return [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ];
  }
  return field.options.map((option) => ({ value: option, label: option }));
}

/** Answers currently stored on a pick list / checkbox / multi-select. */
export function parseFieldAnswers(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    if (typeof parsed === "string") return parsed ? [parsed] : [];
    if (typeof parsed === "boolean") return [parsed ? "true" : "false"];
    if (typeof parsed === "number") return [String(parsed)];
  } catch {
    // Bare pick-list values are not JSON.
  }
  return [value];
}

export function fieldIsLogicallyVisible(
  field: { visibility?: FieldVisibility | null },
  values: Record<string, string>,
  knownFieldIds?: Iterable<string>,
): boolean {
  const rule = field.visibility;
  if (!rule?.dependsOn || rule.values.length === 0) return true;
  if (knownFieldIds) {
    const ids =
      knownFieldIds instanceof Set ? knownFieldIds : new Set(knownFieldIds);
    if (!ids.has(rule.dependsOn)) return true;
  }
  const answers = parseFieldAnswers(values[rule.dependsOn]);
  return rule.values.some((wanted) => answers.includes(wanted));
}

export function fieldAppliesOnForm(
  field: {
    showOn: string;
    visibility?: FieldVisibility | string | null;
  },
  mode: "create" | "edit",
  values: Record<string, string>,
  knownFieldIds?: Iterable<string>,
): boolean {
  if (field.showOn !== "both" && field.showOn !== mode) return false;
  return fieldIsLogicallyVisible(
    { visibility: parseFieldVisibility(field.visibility) },
    values,
    knownFieldIds,
  );
}

type VisibilityLayoutField = {
  id: string;
  binding?: string | null;
  visibility?: FieldVisibility | string | null;
};

/**
 * Drop answers on fields the pick list has hidden. Walks the chain so a
 * nested “Show when” field is cleared after its parent is wiped.
 */
export function clearHiddenFieldValues(
  fields: VisibilityLayoutField[],
  values: Record<string, string>,
  knownFieldIds?: Iterable<string>,
): Record<string, string> {
  const next = { ...values };
  const ids = knownFieldIds ?? fields.map((field) => field.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const field of fields) {
      if (field.binding) continue;
      if (
        fieldIsLogicallyVisible(
          { visibility: parseFieldVisibility(field.visibility) },
          next,
          ids,
        )
      ) {
        continue;
      }
      if (!next[field.id]?.trim()) continue;
      next[field.id] = "";
      changed = true;
    }
  }
  return next;
}

function normalizeVisibility(
  dependsOn: string,
  values: string[],
): FieldVisibility | null {
  const id = dependsOn.trim();
  if (!id) return null;
  return {
    dependsOn: id,
    values: values.map((value) => value.trim()).filter(Boolean),
  };
}
