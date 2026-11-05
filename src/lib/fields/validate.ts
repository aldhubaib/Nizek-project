import { isFieldAnswered } from "@/lib/board-fields";
import { costFieldIsFilled } from "./cost";
import { articleFieldIsFilled } from "./article";
import { inviteFieldIsFilled } from "./invite";
import { phoneValueIsFilled } from "@/lib/dial-codes";
import {
  NATIVE_FIELDS,
  type CustomFieldType,
  type NativeFieldId,
} from "./types";
import type { FieldSnapshot, NativeFieldSnapshot } from "@/lib/workflow/types";

export function nativeFieldIsFilled(
  field: NativeFieldId,
  native: NativeFieldSnapshot,
): boolean {
  switch (field) {
    case "title":
      return native.title.trim().length > 0;
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
    fieldValues: Record<string, string>;
  },
): boolean {
  if (!field.required) return true;
  if (field.binding === "title") return values.title.trim().length > 0;
  return customFieldIsFilled(field.type, values.fieldValues[field.id]);
}

export function customFieldIsFilled(
  type: CustomFieldType,
  value: string | null | undefined,
): boolean {
  if (type === "formula") return true;
  if (type === "phone") return phoneValueIsFilled(value);
  if (type === "cost") return costFieldIsFilled(value);
  if (type === "invite") return inviteFieldIsFilled(value);
  if (type === "article") return articleFieldIsFilled(value);
  if (type === "user") {
    return isFieldAnswered({ type: "select", multiple: true }, value) ||
      Boolean(value?.trim());
  }
  if (type === "checkbox") {
    if (value === "true") return true;
    return isFieldAnswered({ type: "select", multiple: true }, value);
  }
  return isFieldAnswered(
    {
      type:
        type === "multi_select" || type === "country"
          ? "select"
          : type === "file"
            ? "file"
            : "text",
      multiple: type === "multi_select" || type === "country",
    },
    value,
  );
}

export function missingNativeFields(
  native: NativeFieldSnapshot,
  required: string[],
): string[] {
  const missing: string[] = [];
  for (const field of NATIVE_FIELDS) {
    if (!required.includes(field.id)) continue;
    if (!nativeFieldIsFilled(field.id, native)) missing.push(field.label);
  }
  return missing;
}

export function applyNativePatches(
  native: NativeFieldSnapshot,
  patches?: { title?: string },
): NativeFieldSnapshot {
  if (!patches) return native;
  return {
    title: patches.title ?? native.title,
  };
}

export function mergeSnapshot(
  snapshot: FieldSnapshot,
  customValues?: Record<string, string>,
  nativePatches?: { title?: string },
): FieldSnapshot {
  return {
    native: applyNativePatches(snapshot.native, nativePatches),
    custom: { ...snapshot.custom, ...customValues },
  };
}
