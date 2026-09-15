"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import {
  compareSortValues,
  fieldSortValue,
  formatFieldValue,
  type FieldDisplayContext,
} from "@/lib/fields/display";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealDTO } from "@/actions/deal";
import type { DealStageDTO } from "@/actions/deal-stage";
import { TABLE_STATUS_KEY } from "@/lib/modules/card-fields";
import { formatRecordNumber } from "@/lib/modules/record-number";
import { fieldIsLogicallyVisible } from "@/lib/fields/visibility";

export type ListSort = { key: string; dir: "asc" | "desc" };

const STATUS_KEY = "status";
const TITLE_KEY = "title";
const ID_KEY = "recordNumber";

export function ModuleRecordList({
  records,
  stages,
  fields,
  sort,
  onSort,
  onOpen,
  empty,
  ctx,
  visibleColumnIds,
}: {
  records: DealDTO[];
  stages: DealStageDTO[];
  fields: CustomFieldDTO[];
  sort: ListSort;
  onSort: (next: ListSort) => void;
  onOpen: (record: DealDTO) => void;
  empty: string;
  ctx: FieldDisplayContext;
  visibleColumnIds: string[];
}) {
  const columns = listColumns(fields, visibleColumnIds);
  const activeSort = columns.some((col) => col.key === sort.key)
    ? sort
    : { key: TITLE_KEY, dir: sort.dir };
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const sorted = [...records].sort((a, b) => {
    if (activeSort.key === STATUS_KEY) {
      return compareSortValues(
        stageById.get(a.stageId ?? "")?.name ?? "",
        stageById.get(b.stageId ?? "")?.name ?? "",
        activeSort.dir,
      );
    }
    if (activeSort.key === ID_KEY) {
      return compareSortValues(a.recordNumber, b.recordNumber, activeSort.dir);
    }
    if (activeSort.key === TITLE_KEY) {
      return compareSortValues(
        a.title.toLowerCase(),
        b.title.toLowerCase(),
        activeSort.dir,
      );
    }
    const field = fields.find((row) => row.id === activeSort.key);
    if (!field) return 0;
    return compareSortValues(
      fieldSortValue(field, a, ctx),
      fieldSortValue(field, b, ctx),
      activeSort.dir,
    );
  });

  function toggle(key: string) {
    onSort({
      key,
      dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc",
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[40rem] text-start">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {columns.map((col) => {
              const active = activeSort.key === col.key;
              return (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-2.5 text-start align-middle font-medium whitespace-nowrap",
                    col.className,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {col.label}
                    {active ? (
                      activeSort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="border-t border-border/50 px-4 py-8 text-s text-muted-foreground"
              >
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((record) => {
              const stage = record.stageId
                ? stageById.get(record.stageId)
                : undefined;
              const palette = boardColor(stage?.color);
              return (
                <tr
                  key={record.id}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
                  onClick={() => onOpen(record)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onOpen(record);
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "max-w-[16rem] truncate px-4 py-2.5 text-s",
                        col.className,
                      )}
                      dir={col.rtl ? "rtl" : undefined}
                    >
                      {col.key === ID_KEY ? (
                        <span className="font-mono text-muted-foreground">
                          {formatRecordNumber(record.recordNumber)}
                        </span>
                      ) : col.key === TITLE_KEY ? (
                        <span className="font-medium text-foreground">
                          {record.title}
                        </span>
                      ) : col.key === STATUS_KEY ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn("size-1.5 shrink-0 rounded-full", palette.dot)}
                          />
                          {stage?.name ?? "Unassigned"}
                        </span>
                      ) : col.field ? (
                        fieldIsLogicallyVisible(
                          col.field,
                          record.fieldValues ?? {},
                          fields.map((row) => row.id),
                        )
                          ? formatFieldValue(col.field, record, ctx) || "—"
                          : "—"
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

type ListColumn = {
  key: string;
  label: string;
  className?: string;
  field?: CustomFieldDTO;
  rtl?: boolean;
};

function listColumns(
  fields: CustomFieldDTO[],
  visibleColumnIds: string[],
): ListColumn[] {
  const title = fields.find((field) => field.binding === "title");
  const shown = new Set(visibleColumnIds);
  const extras = fields.filter(
    (field) =>
      field.binding !== "title" &&
      field.type !== "file" &&
      shown.has(field.id),
  );
  return [
    { key: ID_KEY, label: "ID", className: "w-[4.5rem]" },
    { key: TITLE_KEY, label: title?.label ?? "Name", className: "w-[16rem]" },
    ...(shown.has(TABLE_STATUS_KEY)
      ? [{ key: STATUS_KEY, label: "Status", className: "w-[10rem]" }]
      : []),
    ...extras.map((field) => ({
      key: field.id,
      label: field.label,
      field,
      rtl: field.script === "arabic",
    })),
  ];
}
