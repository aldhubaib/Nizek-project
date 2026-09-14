/**
 * Extra settings for Single line fields, stored in CustomField.options
 * the same way Relation stores `{ model, multiple }`.
 */

export const TEXT_SCRIPTS = ["arabic"] as const;
export type TextScript = (typeof TEXT_SCRIPTS)[number];

export type TextFieldConfig = {
  script: TextScript | null;
};

export function isTextScript(value: string): value is TextScript {
  return (TEXT_SCRIPTS as readonly string[]).includes(value);
}

export function parseTextConfig(
  raw: string | null | undefined,
): TextFieldConfig {
  if (!raw) return { script: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { script: null };
    }
    const script = (parsed as { script?: unknown }).script;
    return {
      script: typeof script === "string" && isTextScript(script) ? script : null,
    };
  } catch {
    return { script: null };
  }
}

export function stringifyTextConfig(config: TextFieldConfig): string | null {
  return config.script ? JSON.stringify({ script: config.script }) : null;
}

/** Arabic letters and marks, plus spaces, digits, and punctuation. */
const NON_ARABIC = /[^\p{Script=Arabic}\p{M}\s\p{N}\p{P}]/gu;

export function keepArabicOnly(value: string): string {
  return value.replace(NON_ARABIC, "");
}

export function applyTextScript(
  value: string,
  script: TextScript | null | undefined,
): string {
  if (script === "arabic") return keepArabicOnly(value);
  return value;
}

export function applyLayoutTextScripts(
  fields: {
    id: string;
    type: string;
    binding: string | null;
    options: string | null;
  }[],
  title: string,
  fieldValues: Record<string, string>,
): { title: string; fieldValues: Record<string, string> } {
  let nextTitle = title;
  const nextValues = { ...fieldValues };
  for (const field of fields) {
    if (field.type !== "text") continue;
    const script = parseTextConfig(field.options).script;
    if (!script) continue;
    if (field.binding === "title") {
      nextTitle = applyTextScript(nextTitle, script);
      continue;
    }
    if (field.binding) continue;
    const current = nextValues[field.id];
    if (current) nextValues[field.id] = applyTextScript(current, script);
  }
  return { title: nextTitle, fieldValues: nextValues };
}
