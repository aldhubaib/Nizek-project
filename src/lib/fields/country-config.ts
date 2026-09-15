/**
 * Extra settings for Country fields, stored in CustomField.options as `{ multiple }`.
 *
 * Older country fields have no options JSON and already store a list of codes,
 * so a missing config means several countries.
 */

export type CountryFieldConfig = {
  multiple: boolean;
};

export function parseCountryConfig(
  raw: string | null | undefined,
): CountryFieldConfig {
  if (!raw) return { multiple: true };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { multiple: true };
    }
    const multiple = (parsed as { multiple?: unknown }).multiple;
    if (multiple === false) return { multiple: false };
    if (multiple === true) return { multiple: true };
    return { multiple: true };
  } catch {
    return { multiple: true };
  }
}

export function stringifyCountryConfig(config: CountryFieldConfig): string {
  return JSON.stringify({
    multiple: config.multiple !== false,
  });
}
