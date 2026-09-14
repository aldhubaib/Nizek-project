import { stringifyCountryCodes } from "@/lib/countries";
import { stringifyPhoneValue } from "@/lib/dial-codes";
import { industryLabel } from "@/lib/industries";

export type LayoutFieldRef = {
  id: string;
  type: string;
  label: string;
  key: string;
};

export type NativeDirectoryValues = {
  website?: string | null;
  industry?: string | null;
  countries?: string[];
  email?: string | null;
  phoneCountry?: string | null;
  phoneNumber?: string | null;
};

function firstField(
  fields: LayoutFieldRef[],
  match: (field: LayoutFieldRef) => boolean,
) {
  return fields.find((field) => match(field));
}

function fill(
  values: Record<string, string>,
  field: LayoutFieldRef | undefined,
  raw: string,
) {
  if (!field || values[field.id] || !raw) return;
  values[field.id] = raw;
}

/** Copy leftover contact/company columns into layout fields when those are empty. */
export function mergeNativeFieldValues(
  entityType: "contact" | "company",
  native: NativeDirectoryValues,
  fields: LayoutFieldRef[],
  custom: Record<string, string>,
): Record<string, string> {
  const values = { ...custom };
  if (entityType === "company") {
    fill(
      values,
      firstField(fields, (field) => field.type === "country"),
      stringifyCountryCodes(native.countries ?? []),
    );
    fill(
      values,
      firstField(
        fields,
        (field) =>
          field.type === "url" || /website/i.test(field.label) || field.key === "url",
      ),
      native.website?.trim() ?? "",
    );
    fill(
      values,
      firstField(
        fields,
        (field) => /industry/i.test(field.label) || field.key === "industry",
      ),
      industryLabel(native.industry),
    );
    return values;
  }

  fill(
    values,
    firstField(fields, (field) => field.type === "email" || field.key === "email"),
    native.email?.trim() ?? "",
  );
  const phone = firstField(fields, (field) => field.type === "phone");
  if (phone && !values[phone.id] && native.phoneNumber) {
    values[phone.id] = stringifyPhoneValue({
      country: native.phoneCountry || "KW",
      number: native.phoneNumber,
    });
  }
  return values;
}
