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
  "relation",
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
  relation: "Relation",
};

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const FIELD_SHOW_ON = ["create", "edit", "both"] as const;
export type FieldShowOn = (typeof FIELD_SHOW_ON)[number];

export const NATIVE_DEAL_FIELDS = [
  { id: "title", label: "Title" },
  { id: "value", label: "Value" },
  { id: "contacts", label: "At least one contact" },
  { id: "companies", label: "At least one company" },
] as const;

export type NativeDealFieldId = (typeof NATIVE_DEAL_FIELDS)[number]["id"];

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

export function nativeDealFieldLabel(id: string): string {
  return NATIVE_DEAL_FIELDS.find((f) => f.id === id)?.label ?? id;
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
