"use client";

import { SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TABLE_STATUS_KEY,
  CARD_RECORD_NUMBER_KEY,
  cardFieldChoices,
} from "@/lib/modules/card-fields";
import type { CustomFieldDTO } from "@/actions/custom-field";

export function CardFieldsPicker({
  fields,
  visibleIds,
  onChange,
  mode,
}: {
  fields: CustomFieldDTO[];
  visibleIds: string[];
  onChange: (ids: string[]) => void;
  mode: "card" | "table";
}) {
  const choices = cardFieldChoices(fields).filter((field) =>
    mode === "table" ? field.type !== "file" : true,
  );
  const visible = new Set(visibleIds);
  const title =
    fields.find((field) => field.binding === "title")?.label ?? "Name";

  function toggle(id: string, on: boolean) {
    if (on) onChange([...visibleIds, id]);
    else onChange(visibleIds.filter((item) => item !== id));
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={mode === "table" ? "Table columns" : "Card fields"}
        className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
      >
        <SlidersHorizontal className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>
            {mode === "table" ? "Table columns" : "Card fields"}
          </PopoverTitle>
          <PopoverDescription>
            {mode === "table"
              ? "Choose which columns appear in the list. Saved until you change it."
              : "Choose what appears on each card. Saved until you change it."}
          </PopoverDescription>
        </PopoverHeader>
        <label className="flex items-center gap-2 text-s">
          <input type="checkbox" checked disabled />
          {title}
        </label>
        {mode === "card" && (
          <label className="flex items-center gap-2 text-s">
            <input
              type="checkbox"
              checked={visible.has(CARD_RECORD_NUMBER_KEY)}
              onChange={(e) =>
                toggle(CARD_RECORD_NUMBER_KEY, e.target.checked)
              }
            />
            ID
          </label>
        )}
        {mode === "table" && (
          <>
            <label className="flex items-center gap-2 text-s">
              <input
                type="checkbox"
                checked={visible.has(CARD_RECORD_NUMBER_KEY)}
                onChange={(e) =>
                  toggle(CARD_RECORD_NUMBER_KEY, e.target.checked)
                }
              />
              ID
            </label>
            <label className="flex items-center gap-2 text-s">
              <input
                type="checkbox"
                checked={visible.has(TABLE_STATUS_KEY)}
                onChange={(e) => toggle(TABLE_STATUS_KEY, e.target.checked)}
              />
              Status
            </label>
          </>
        )}
        {choices.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add fields on the layout to show them here.
          </p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {choices.map((field) => (
              <label key={field.id} className="flex items-center gap-2 text-s">
                <input
                  type="checkbox"
                  checked={visible.has(field.id)}
                  onChange={(e) => toggle(field.id, e.target.checked)}
                />
                {field.label}
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
