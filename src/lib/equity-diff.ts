import { EQUITY_STRUCTURE } from "@/lib/equity-math";

/**
 * Working out what changed, with no database in sight.
 *
 * The equity forms save whole — a split, a contract, the pitch, all submitted
 * as the finished picture rather than as a list of edits — so the only way to
 * say who changed what is to compare the version that was there against the one
 * that replaced it. That comparison is all here, kept apart from the writing of
 * it so it can be reasoned about and tested on its own.
 */

/**
 * A row as its fields read on screen, keyed by the label the form gives them.
 * Reducing both sides to one of these is what lets a database row and the form
 * input that replaced it be compared at all: they hold dates, numbers and nulls
 * in different shapes, but they read the same way.
 */
export type Snapshot = Record<string, string | null>;

export type EquityChange = {
  label: string;
  old: string | null;
  new: string | null;
};

/** Anything a form field can hold, as the line it should read as. */
export function asText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toLocaleDateString("en-GB");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return String(value);
}

export function pct(value: number | null | undefined): string | null {
  return value == null ? null : `${value}%`;
}

export function money(
  value: number | null | undefined,
  currency: string,
): string | null {
  return value == null ? null : `${value.toLocaleString()} ${currency}`;
}

export function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB");
}

/**
 * The fields that actually moved. Only fields present in `after` are compared,
 * so a partial update doesn't report the untouched half of the form as wiped.
 * A missing `before` means the row is new, and every filled field is reported
 * as an addition.
 */
export function diffSnapshots(
  before: Snapshot | null,
  after: Snapshot,
): EquityChange[] {
  const changes: EquityChange[] = [];
  for (const [label, newValue] of Object.entries(after)) {
    const oldValue = before ? (before[label] ?? null) : null;
    if (oldValue === newValue) continue;
    if (!before && newValue == null) continue;
    changes.push({ label, old: oldValue, new: newValue });
  }
  return changes;
}

// ─── Equity splits ──────────────────────────────────────

export type SplitRow = {
  structureType: string;
  equityPct: number;
  holder: { name: string } | null;
  role: { name: string } | null;
  tranches: { startsAtValuation: number }[];
};

/** Who a row belongs to, which is how a reader recognises it between saves. */
export function rowName(row: SplitRow) {
  const name = row.holder?.name ?? "Unassigned";
  return row.role?.name ? `${name} · ${row.role.name}` : name;
}

function rowSnapshot(row: SplitRow, currency: string): Snapshot {
  return {
    "Equity %": pct(row.equityPct),
    Type:
      EQUITY_STRUCTURE[row.structureType as keyof typeof EQUITY_STRUCTURE] ??
      row.structureType,
    "Dilutes at": row.tranches[0]
      ? money(row.tranches[0].startsAtValuation, currency)
      : null,
  };
}

/** The one-liner a row reads as when it arrives or leaves whole. */
function rowSummary(row: SplitRow, currency: string) {
  return Object.values(rowSnapshot(row, currency))
    .filter((value) => value != null)
    .join(" · ");
}

function groupByName(rows: SplitRow[]) {
  const groups = new Map<string, SplitRow[]>();
  for (const row of rows) {
    const key = rowName(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

export type SplitRowChange =
  | { action: "created"; label: string; value: string }
  | { action: "deleted"; label: string; value: string }
  | { action: "updated"; changes: EquityChange[] };

/**
 * What moved between two versions of a split.
 *
 * Rows are matched by name, and by position among rows sharing one, because a
 * name is what a reader tracks between saves. Matching on position alone would
 * report every row below an insertion as changed, and a holder appearing twice
 * is the normal way a protected stake is recorded in stages — so the second row
 * under a name is numbered rather than mistaken for a different person.
 */
export function diffSplitRows(
  before: SplitRow[],
  after: SplitRow[],
  currency: string,
): SplitRowChange[] {
  const oldRows = groupByName(before);
  const newRows = groupByName(after);
  const result: SplitRowChange[] = [];

  for (const [name, rows] of newRows) {
    const previous = oldRows.get(name) ?? [];
    for (let i = 0; i < rows.length; i++) {
      const label = rows.length > 1 ? `${name} (${i + 1})` : name;
      const old = previous[i];
      if (!old) {
        result.push({
          action: "created",
          label,
          value: rowSummary(rows[i], currency),
        });
        continue;
      }
      const changes = diffSnapshots(
        rowSnapshot(old, currency),
        rowSnapshot(rows[i], currency),
      ).map((change) => ({ ...change, label: `${label} — ${change.label}` }));
      if (changes.length > 0) result.push({ action: "updated", changes });
    }
  }

  for (const [name, rows] of oldRows) {
    const kept = newRows.get(name)?.length ?? 0;
    for (let i = kept; i < rows.length; i++) {
      result.push({
        action: "deleted",
        label: rows.length > 1 ? `${name} (${i + 1})` : name,
        value: rowSummary(rows[i], currency),
      });
    }
  }

  return result;
}
