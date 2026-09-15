"use client";

import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  parseCostAmount,
  parseCostRows,
  stringifyCostRows,
  formatCostTotal,
  type CostRow,
} from "@/lib/fields/cost";

const EMPTY_ROW: CostRow = { title: "", cost: "" };

export function CostField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: ReactNode;
}) {
  const stored = parseCostRows(value);
  const rows = stored.length > 0 ? stored : [EMPTY_ROW];

  function commit(next: CostRow[]) {
    onChange(stringifyCostRows(next));
  }

  function patch(index: number, key: keyof CostRow, nextValue: string) {
    commit(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: nextValue } : row,
      ),
    );
  }

  function addRow() {
    commit([...rows, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    commit(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  const total = formatCostTotal(rows);
  const hasNumber = rows.some((row) => parseCostAmount(row.cost) !== null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {label}
        <button
          type="button"
          onClick={addRow}
          className="ms-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-s text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add row
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-start">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 text-start font-medium">Title</th>
              <th className="w-36 px-2 py-2 text-start font-medium">Cost</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-border/50">
                <td className="px-2 py-1.5">
                  <Input
                    value={row.title}
                    onChange={(e) => patch(index, "title", e.target.value)}
                    placeholder="Item"
                    className="h-8"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={row.cost}
                    onChange={(e) => patch(index, "cost", e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    className="h-8 tabular-nums"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <button
                    type="button"
                    title="Remove row"
                    aria-label="Remove row"
                    onClick={() => removeRow(index)}
                    disabled={rows.length === 1 && !row.title && !row.cost}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                  >
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/50">
              <td className="px-3 py-2.5 text-s font-medium">Total</td>
              <td className="px-3 py-2.5 text-s font-medium tabular-nums">
                {hasNumber ? total : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
