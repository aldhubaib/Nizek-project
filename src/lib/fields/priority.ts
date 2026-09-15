export const FIELD_PRIORITIES = [
  "VERY_HIGH",
  "HIGH",
  "NORMAL",
  "LOW",
  "VERY_LOW",
] as const;

export type FieldPriorityId = (typeof FIELD_PRIORITIES)[number];

export const FIELD_PRIORITY_LABEL: Record<FieldPriorityId, string> = {
  VERY_HIGH: "Very high",
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
  VERY_LOW: "Very low",
};

export function isFieldPriority(value: string | null | undefined): value is FieldPriorityId {
  return (
    typeof value === "string" &&
    (FIELD_PRIORITIES as readonly string[]).includes(value)
  );
}

export function fieldPriorityLabel(value: string | null | undefined): string {
  if (!value) return "";
  return isFieldPriority(value) ? FIELD_PRIORITY_LABEL[value] : value;
}

export function fieldPriorityRank(value: string | null | undefined): number {
  if (!isFieldPriority(value)) return -1;
  return FIELD_PRIORITIES.indexOf(value);
}

export const FIELD_PRIORITY_CHOICES = FIELD_PRIORITIES.map((id) => ({
  value: id,
  label: FIELD_PRIORITY_LABEL[id],
}));
