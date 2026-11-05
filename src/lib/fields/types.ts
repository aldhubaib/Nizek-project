export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "cost",
  "select",
  "priority",
  "multi_select",
  "date",
  "invite",
  "checkbox",
  "url",
  "email",
  "phone",
  "country",
  "user",
  "file",
  "formula",
  "article",
] as const;

export const CUSTOM_FIELD_TYPE_LABEL: Record<
  (typeof CUSTOM_FIELD_TYPES)[number],
  string
> = {
  text: "Single line",
  textarea: "Multi line",
  number: "Number",
  cost: "Cost",
  select: "Pick list",
  priority: "Priority",
  multi_select: "Multi select",
  date: "Date",
  invite: "Calendar invite",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone: "Phone",
  country: "Country",
  user: "User",
  file: "File",
  formula: "Formula",
  article: "Article",
};

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const FIELD_SHOW_ON = ["create", "edit", "both", "hidden"] as const;
export type FieldShowOn = (typeof FIELD_SHOW_ON)[number];

/** Columns that live on the record row itself rather than in CustomFieldValue. */
export const NATIVE_FIELDS = [{ id: "title", label: "Title" }] as const;

export type NativeFieldId = (typeof NATIVE_FIELDS)[number]["id"];

export type FieldCatalogEntry = {
  id: string;
  label: string;
  type: CustomFieldType | "native";
  required?: boolean;
  options?: string[];
  native?: boolean;
};

export function isCustomFieldType(value: string): value is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

export function isFieldShowOn(value: string): value is FieldShowOn {
  return (FIELD_SHOW_ON as readonly string[]).includes(value);
}

export function parseFieldOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    }
  } catch {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}
