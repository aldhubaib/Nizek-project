import { formatDealValue } from "@/lib/deal-value";

export type CostRow = {
  title: string;
  cost: string;
};

export function parseCostAmount(raw: string | null | undefined): number | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  const normalised = text.replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,3})?$/.test(normalised)) return null;
  const amount = Number(normalised);
  return Number.isFinite(amount) ? amount : null;
}

export function parseCostRows(raw: string | null | undefined): CostRow[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as { title?: unknown; cost?: unknown };
      return [
        {
          title: typeof row.title === "string" ? row.title : "",
          cost: typeof row.cost === "string" ? row.cost : "",
        },
      ];
    });
  } catch {
    return [];
  }
}

function rowHasContent(row: CostRow): boolean {
  return row.title.trim().length > 0 || row.cost.trim().length > 0;
}

export function stringifyCostRows(rows: CostRow[]): string {
  if (rows.length === 0) return "";
  if (rows.length === 1 && !rowHasContent(rows[0])) return "";
  return JSON.stringify(
    rows.map((row) => ({
      title: row.title,
      cost: row.cost,
    })),
  );
}

export function sumCostRows(rows: CostRow[]): number {
  return rows.reduce((total, row) => {
    const amount = parseCostAmount(row.cost);
    return amount === null ? total : total + amount;
  }, 0);
}

export function costFieldIsFilled(raw: string | null | undefined): boolean {
  return parseCostRows(raw).some(
    (row) => row.title.trim().length > 0 && parseCostAmount(row.cost) !== null,
  );
}

export function formatCostTotal(rows: CostRow[]): string {
  return formatDealValue(String(sumCostRows(rows))) || "0";
}

/** Short value for cards and lists. */
export function formatCostField(raw: string | null | undefined): string {
  const rows = parseCostRows(raw).filter(
    (row) => row.title.trim() || parseCostAmount(row.cost) !== null,
  );
  if (rows.length === 0) return "";
  const total = formatCostTotal(rows);
  if (rows.length === 1) {
    const title = rows[0].title.trim();
    return title ? `${title} · ${total}` : total;
  }
  return `${rows.length} items · ${total}`;
}

/** Line items plus total, for history. */
export function formatCostFieldDetail(raw: string | null | undefined): string {
  const rows = parseCostRows(raw).filter(
    (row) => row.title.trim() || parseCostAmount(row.cost) !== null,
  );
  if (rows.length === 0) return "";
  const items = rows
    .map((row) => {
      const title = row.title.trim() || "—";
      const amount = parseCostAmount(row.cost);
      const cost = amount === null ? "—" : formatDealValue(String(amount));
      return `${title} ${cost}`;
    })
    .join(", ");
  return `${items} (total ${formatCostTotal(rows)})`;
}
