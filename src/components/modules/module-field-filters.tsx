"use client";

import { X } from "lucide-react";
import {
  EMPTY_FIELD_FILTER,
  activeFieldFilterCount,
  fieldFilterChoices,
  filterableFields,
} from "@/lib/fields/filter";
import type { FieldDisplayContext } from "@/lib/fields/display";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealDTO } from "@/actions/deal";

export function ModuleFieldFilters({
  fields,
  records,
  ctx,
  selected,
  onChange,
}: {
  fields: CustomFieldDTO[];
  records: DealDTO[];
  ctx: FieldDisplayContext;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const offered = filterableFields(fields);
  if (offered.length === 0) return null;

  const active = activeFieldFilterCount(fields, selected);

  return (
    <>
      {offered.map((field) => {
        const choices = fieldFilterChoices(field, records, ctx);
        return (
          <select
            key={field.id}
            value={selected[field.id] ?? ""}
            onChange={(event) =>
              onChange({ ...selected, [field.id]: event.target.value })
            }
            aria-label={`Filter by ${field.label}`}
            className="h-9 max-w-[14rem] rounded-md border border-input bg-transparent px-3 text-s"
          >
            <option value="">All {field.label}</option>
            <option value={EMPTY_FIELD_FILTER}>Empty</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        );
      })}
      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="flex h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3" />
          Clear filters
        </button>
      )}
    </>
  );
}
