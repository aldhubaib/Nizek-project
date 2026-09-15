/**
 * Extra settings for Formula fields, stored in CustomField.options as
 * `{ parts, separator, cardTitle }`.
 *
 * A formula is read-only: it joins sibling field values at display time and
 * is never saved as its own CustomFieldValue.
 */

export type FormulaFieldConfig = {
  parts: string[];
  separator: string;
  cardTitle: boolean;
};

export const DEFAULT_FORMULA: FormulaFieldConfig = {
  parts: [],
  separator: " ",
  cardTitle: true,
};

export function canBeFormulaPart(field: {
  id: string;
  type: string;
}): boolean {
  return (
    field.type !== "formula" &&
    field.type !== "file" &&
    field.type !== "invite" &&
    field.type !== "cost" &&
    field.type !== "article"
  );
}

export function parseFormulaConfig(
  raw: string | FormulaFieldConfig | null | undefined,
): FormulaFieldConfig {
  if (!raw) return { ...DEFAULT_FORMULA };
  if (typeof raw === "object") {
    return normalizeFormula(raw.parts, raw.separator, raw.cardTitle);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_FORMULA };
    }
    const obj = parsed as {
      parts?: unknown;
      separator?: unknown;
      cardTitle?: unknown;
    };
    const parts = Array.isArray(obj.parts)
      ? obj.parts.filter((id): id is string => typeof id === "string")
      : [];
    return normalizeFormula(
      parts,
      typeof obj.separator === "string" ? obj.separator : DEFAULT_FORMULA.separator,
      obj.cardTitle === true,
    );
  } catch {
    return { ...DEFAULT_FORMULA };
  }
}

export function stringifyFormulaConfig(config: FormulaFieldConfig): string {
  return JSON.stringify(normalizeFormula(
    config.parts,
    config.separator,
    config.cardTitle,
  ));
}

export function formulaSourceValues(
  fields: { id: string; binding?: string | null }[],
  title: string,
  value: string,
  fieldValues: Record<string, string>,
): Record<string, string> {
  const values = { ...fieldValues };
  for (const field of fields) {
    if (field.binding === "title") values[field.id] = title;
    if (field.binding === "value") values[field.id] = value;
  }
  return values;
}

export function joinFormulaParts(
  parts: string[],
  values: Record<string, string>,
  separator = DEFAULT_FORMULA.separator,
): string {
  return parts
    .map((id) => (values[id] ?? "").trim())
    .filter(Boolean)
    .join(separator)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFormula(
  parts: string[],
  separator: string,
  cardTitle: boolean,
): FormulaFieldConfig {
  return {
    parts: [...new Set(parts.map((id) => id.trim()).filter(Boolean))],
    separator: separator.length > 0 ? separator : DEFAULT_FORMULA.separator,
    cardTitle,
  };
}
