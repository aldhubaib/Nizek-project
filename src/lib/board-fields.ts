/**
 * Whether a card has answered what its type asks of it.
 *
 * The encoding is whatever `src/components/kanban/question-field.tsx` writes,
 * since that component draws these fields: a select holds a JSON array when it
 * is multiple, a file field holds `name::url` entries joined by `|||`, and
 * everything else holds plain text.
 *
 * Deliberately a separate reader from `src/lib/task-readiness.ts` rather than an
 * import of it. That one carries rules boards have no notion of — client
 * questions, and a "Priority" question that has to be ignored because priority
 * lives on the task itself — and boards should not inherit those, nor break
 * when they change for sprint reasons.
 *
 * Kept free of Prisma so it can be unit-tested directly.
 */

export interface BoardFieldShape {
  id: string;
  label: string;
  type: string;
  multiple?: boolean;
  required: boolean;
}

/** True when a field holds a real answer rather than a blank or an empty list. */
export function isFieldAnswered(
  field: Pick<BoardFieldShape, "type" | "multiple">,
  value: string | null | undefined,
): boolean {
  if (!value || !value.trim()) return false;

  if (field.type === "file" || (field.type === "select" && field.multiple)) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.length > 0;
    } catch {
      // A file field's `name::url|||name::url` is not JSON, and a single-value
      // select saved before `multiple` was turned on is a bare string. Both are
      // real answers, so fall through rather than calling them blank.
    }
    return value.split("|||").filter(Boolean).length > 0;
  }

  return true;
}

/** The required fields a card has left blank, in the order they are asked. */
export function missingRequiredFields(
  fields: BoardFieldShape[],
  values: Record<string, string | null | undefined>,
): BoardFieldShape[] {
  return fields.filter(
    (field) => field.required && !isFieldAnswered(field, values[field.id]),
  );
}

export function isCardComplete(
  fields: BoardFieldShape[],
  values: Record<string, string | null | undefined>,
): boolean {
  return missingRequiredFields(fields, values).length === 0;
}
