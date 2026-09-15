import type { CustomFieldDTO } from "@/actions/custom-field";

export const TABLE_STATUS_KEY = "status";
export const CARD_RECORD_NUMBER_KEY = "record-number";

export type FieldPickerPrefs = {
  visible: string[];
  seen: string[];
};

export function cardFieldsStorageKey(entityType: string, projectId = "") {
  return `module-card-fields:${entityType}:${projectId}`;
}

export function cardFieldChoices(fields: CustomFieldDTO[]): CustomFieldDTO[] {
  return fields.filter((field) => field.binding !== "title");
}

export function defaultCardFieldIds(fields: CustomFieldDTO[]): string[] {
  return [
    CARD_RECORD_NUMBER_KEY,
    ...cardFieldChoices(fields).map((field) => field.id),
  ];
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

export function readFieldPickerPrefs(key: string): FieldPickerPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { visible: stringIds(parsed), seen: [] };
    }
    if (parsed && typeof parsed === "object") {
      const row = parsed as { visible?: unknown; seen?: unknown };
      if (!Array.isArray(row.visible)) return null;
      return { visible: stringIds(row.visible), seen: stringIds(row.seen) };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeFieldPickerPrefs(key: string, prefs: FieldPickerPrefs) {
  window.localStorage.setItem(key, JSON.stringify(prefs));
}

function isSpecialKey(id: string) {
  return id === TABLE_STATUS_KEY || id === CARD_RECORD_NUMBER_KEY;
}

function mergeVisible(
  allowed: string[],
  saved: FieldPickerPrefs | null,
  fallback: string[],
): string[] {
  const allowedSet = new Set(allowed);
  const keep = (id: string) => allowedSet.has(id) || isSpecialKey(id);
  if (!saved) return fallback.filter(keep);

  const seen = new Set(saved.seen.length > 0 ? saved.seen : allowed);
  const visible = saved.visible.filter(keep);
  const added = allowed.filter((id) => !seen.has(id));
  return [...visible, ...added];
}

export function resolveCardFieldIds(
  fields: CustomFieldDTO[],
  saved: FieldPickerPrefs | null,
): string[] {
  const allowed = defaultCardFieldIds(fields);
  return mergeVisible(allowed, saved, allowed);
}

export function tableColumnsStorageKey(entityType: string, projectId = "") {
  return `module-table-columns:${entityType}:${projectId}`;
}

export function defaultTableColumnIds(fields: CustomFieldDTO[]): string[] {
  return [
    CARD_RECORD_NUMBER_KEY,
    TABLE_STATUS_KEY,
    ...fields
      .filter((field) => field.binding !== "title" && field.type !== "file")
      .map((field) => field.id),
  ];
}

export function resolveTableColumnIds(
  fields: CustomFieldDTO[],
  saved: FieldPickerPrefs | null,
): string[] {
  const allowed = defaultTableColumnIds(fields).filter(
    (id) => !isSpecialKey(id),
  );
  const fallback = defaultTableColumnIds(fields);
  const merged = mergeVisible(allowed, saved, fallback);
  if (!saved) return fallback;
  const withSpecials = [...merged];
  for (const key of [CARD_RECORD_NUMBER_KEY, TABLE_STATUS_KEY]) {
    if (saved.visible.includes(key) && !withSpecials.includes(key)) {
      withSpecials.unshift(key);
    }
  }
  if (
    !saved.seen.includes(CARD_RECORD_NUMBER_KEY) &&
    !withSpecials.includes(CARD_RECORD_NUMBER_KEY)
  ) {
    withSpecials.unshift(CARD_RECORD_NUMBER_KEY);
  }
  return withSpecials;
}

export function fieldPickerPrefsFromVisible(
  visible: string[],
  knownIds: string[],
): FieldPickerPrefs {
  const seen = new Set(knownIds);
  seen.add(TABLE_STATUS_KEY);
  seen.add(CARD_RECORD_NUMBER_KEY);
  return { visible, seen: [...seen] };
}
