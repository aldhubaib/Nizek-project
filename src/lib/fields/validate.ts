import { isFieldAnswered } from "@/lib/board-fields";
import { phoneValueIsFilled } from "@/lib/dial-codes";
import {
  NATIVE_DEAL_FIELDS,
  type CustomFieldType,
  type NativeDealFieldId,
} from "./types";
import type { FieldSnapshot, NativeFieldSnapshot } from "@/lib/workflow/types";

export function nativeFieldIsFilled(
  field: NativeDealFieldId,
  native: NativeFieldSnapshot,
): boolean {
  switch (field) {
    case "title":
      return native.title.trim().length > 0;
    case "value":
      return Boolean(native.value && native.value.trim());
    case "contacts":
      return native.contactIds.length > 0;
    case "companies":
      return native.companyIds.length > 0;
  }
}

export function requiredLayoutFieldIsFilled(
  field: {
    id: string;
    required: boolean;
    binding: string | null;
    type: CustomFieldType;
  },
  values: {
    title: string;
    value?: string | null;
    contactIds?: string[];
    companyIds?: string[];
    fieldValues: Record<string, string>;
  },
): boolean {
  if (!field.required) return true;
  if (field.binding === "title") return values.title.trim().length > 0;
  if (field.binding === "value") return Boolean(values.value?.trim());
  if (field.binding === "contacts") return (values.contactIds?.length ?? 0) > 0;
  if (field.binding === "companies") return (values.companyIds?.length ?? 0) > 0;
  return customFieldIsFilled(field.type, values.fieldValues[field.id]);
}

export function customFieldIsFilled(
  type: CustomFieldType,
  value: string | null | undefined,
): boolean {
  if (type === "phone") return phoneValueIsFilled(value);
  if (type === "checkbox") {
    if (value === "true") return true;
    return isFieldAnswered({ type: "select", multiple: true }, value);
  }
  return isFieldAnswered(
    {
      type:
        type === "multi_select" || type === "relation" || type === "country"
          ? "select"
          : type === "file"
            ? "file"
            : "text",
      multiple: type === "multi_select" || type === "relation" || type === "country",
    },
    value,
  );
}

export function missingNativeFields(
  native: NativeFieldSnapshot,
  required: string[],
): string[] {
  const missing: string[] = [];
  for (const field of NATIVE_DEAL_FIELDS) {
    if (!required.includes(field.id)) continue;
    if (!nativeFieldIsFilled(field.id, native)) missing.push(field.label);
  }
  return missing;
}

export function applyNativePatches(
  native: NativeFieldSnapshot,
  patches?: NativeFieldSnapshot extends never ? never : {
    title?: string;
    value?: string | null;
    contactIds?: string[];
    companyIds?: string[];
  },
): NativeFieldSnapshot {
  if (!patches) return native;
  return {
    title: patches.title ?? native.title,
    value: patches.value !== undefined ? patches.value : native.value,
    contactIds: patches.contactIds ?? native.contactIds,
    companyIds: patches.companyIds ?? native.companyIds,
  };
}

export function mergeSnapshot(
  snapshot: FieldSnapshot,
  customValues?: Record<string, string>,
  nativePatches?: {
    title?: string;
    value?: string | null;
    contactIds?: string[];
    companyIds?: string[];
  },
): FieldSnapshot {
  return {
    native: applyNativePatches(snapshot.native, nativePatches),
    custom: { ...snapshot.custom, ...customValues },
  };
}
