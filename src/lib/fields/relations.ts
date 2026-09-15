/**
 * Models a Relation field can point at.
 *
 * Adding a linkable model later is one registration here, plus a list/count
 * query in `src/actions/related-records.ts`. The layout inspector and deal
 * form pick it up from this list — no per-model UI.
 */

export const RELATION_MODELS = ["company", "contact", "deal", "user"] as const;

export type RelationModel = (typeof RELATION_MODELS)[number];

export type RelationConfig = {
  model: RelationModel;
  multiple: boolean;
};

export const RELATION_MODEL_LABEL: Record<RelationModel, string> = {
  company: "Company",
  contact: "Contact",
  deal: "Deal",
  user: "User",
};

export const DEFAULT_RELATION: RelationConfig = {
  model: "company",
  multiple: true,
};

export function isRelationModel(value: string): value is RelationModel {
  return (RELATION_MODELS as readonly string[]).includes(value);
}

export function parseRelationConfig(
  raw: string | null | undefined,
): RelationConfig {
  if (!raw) return { ...DEFAULT_RELATION };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_RELATION };
    }
    const obj = parsed as { model?: unknown; multiple?: unknown };
    return {
      model: typeof obj.model === "string" && isRelationModel(obj.model)
        ? obj.model
        : DEFAULT_RELATION.model,
      multiple: obj.multiple !== false,
    };
  } catch {
    return { ...DEFAULT_RELATION };
  }
}

export function stringifyRelationConfig(config: RelationConfig): string {
  return JSON.stringify({
    model: isRelationModel(config.model) ? config.model : DEFAULT_RELATION.model,
    multiple: config.multiple !== false,
  });
}

/** Selected record ids stored on CustomFieldValue as a JSON string array. */
export function parseRelationIds(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      );
    }
  } catch {
    return value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}

export function stringifyRelationIds(ids: string[]): string {
  const unique = [...new Set(ids.filter(Boolean))];
  return unique.length > 0 ? JSON.stringify(unique) : "";
}

export type RelatedRecordOption = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type RelatedRecordCatalog = Record<RelationModel, RelatedRecordOption[]>;

export const EMPTY_RELATED_CATALOG: RelatedRecordCatalog = {
  company: [],
  contact: [],
  deal: [],
  user: [],
};

/** Native many-links and custom “allow many” relations go under Related data. */
export function isRelatedDataLayoutField(field: {
  type: string;
  binding: string | null;
  relation: RelationConfig | null;
}): boolean {
  if (field.binding === "companies" || field.binding === "contacts") return true;
  return field.type === "relation" && field.relation?.multiple !== false;
}
