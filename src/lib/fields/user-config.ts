/**
 * Extra settings for User fields, stored in CustomField.options as `{ multiple }`.
 */

export type UserFieldConfig = {
  multiple: boolean;
};

export const DEFAULT_USER_CONFIG: UserFieldConfig = {
  multiple: false,
};

export function parseUserConfig(
  raw: string | null | undefined,
): UserFieldConfig {
  if (!raw) return { ...DEFAULT_USER_CONFIG };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_USER_CONFIG };
    }
    return {
      multiple: (parsed as { multiple?: unknown }).multiple === true,
    };
  } catch {
    return { ...DEFAULT_USER_CONFIG };
  }
}

export function stringifyUserConfig(config: UserFieldConfig): string {
  return JSON.stringify({
    multiple: config.multiple === true,
  });
}

/** One id as a bare string, or several as a JSON array — both from older saves. */
export function parseUserIds(value: string | null | undefined): string[] {
  if (!value || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      );
    }
  } catch {
    // Bare id.
  }
  return [value];
}

export function stringifyUserIds(ids: string[], multiple: boolean): string {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return "";
  if (!multiple) return unique[0] ?? "";
  return JSON.stringify(unique);
}
