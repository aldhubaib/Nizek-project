"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import {
  MARKET_CURRENCIES,
  MARKET_TIERS,
  MARKET_UNITS,
  formatMarketAmount,
  marketTierName,
} from "@/lib/market-size";
import {
  saveEquityMarketSize,
  type EquityPortfolioDTO,
} from "@/actions/equity";

type Tier = EquityPortfolioDTO["marketTiers"][number];

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const readCellCls =
  "min-h-9 px-3 py-2 rounded-lg border border-border bg-muted/30 flex items-center text-[13px] text-foreground";

const labelCls =
  "block text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

/** Tier name, then number, unit and currency. */
const GRID = "sm:grid-cols-[minmax(0,1fr)_9rem_9rem_7rem]";

/** Read back, the three amount columns are one line of text again. */
const READ_GRID = "sm:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]";

const HEADINGS = ["Tier", "Number", "Unit", "Currency"];

type TierDraft = {
  /** One of TAM/SAM/SOM — the rows are fixed, this is which one it is. */
  tier: string;
  value: string;
  unit: string;
  currency: string;
};

/**
 * The form is always the same three rows: each preset tier, filled in from
 * whatever was saved under that name. A tier saved without a scale reads back
 * as millions, which is also what a fresh row starts on.
 */
function tierDrafts(tiers: Tier[], currency: string): TierDraft[] {
  return MARKET_TIERS.map((t) => {
    const saved = tiers.find((s) => s.tier === t.key);
    return {
      tier: t.key,
      value: saved?.value != null ? String(saved.value) : "",
      unit: saved?.unit || "MILLION",
      currency: saved?.currency ?? currency,
    };
  });
}

/**
 * How big the market is, tier by tier: the whole of it, then the part that can
 * be served, then the part that can realistically be reached.
 *
 * Its own module rather than a section of the opportunity, because it is one
 * set of amounts measured against each other rather than another list of
 * prose — the report draws it as rings, and the widest tier only means
 * something with the narrower ones inside it.
 */
export function MarketSizeSection({
  portfolioId,
  tiers,
  currency,
}: {
  portfolioId: string;
  tiers: Tier[];
  /** What the portfolio is priced in, which is what a new row starts on. */
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <CollapsibleCard
      icon={Globe2}
      title="Market size"
      summary={
        tiers.length > 0
          ? `${tiers.length} ${tiers.length === 1 ? "tier" : "tiers"}`
          : "Nothing here yet"
      }
      description="How big the market is, from the whole of it down to the part this project can reach. The scale is picked rather than typed, so the report can draw one tier inside another."
      forceOpen={editing}
      actions={
        !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            {tiers.length > 0 ? "Edit" : "Fill in"}
          </button>
        )
      }
    >
      {editing ? (
        <MarketSizeForm
          portfolioId={portfolioId}
          tiers={tiers}
          currency={currency}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : tiers.length === 0 ? (
        <p className="text-[13px] text-muted-foreground px-3 py-2 rounded-lg border border-dashed border-border">
          No market size yet.
        </p>
      ) : (
        <div className="space-y-2">
          <div className={cn("hidden sm:grid gap-2 px-0.5", READ_GRID)}>
            <span className={labelCls}>Tier</span>
            <span className={labelCls}>Amount</span>
          </div>
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={cn("grid gap-2 items-stretch", READ_GRID)}
            >
              <div className={readCellCls}>{marketTierName(tier.tier)}</div>
              <div className={cn(readCellCls, "tabular-nums")}>
                {formatMarketAmount(tier)}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function MarketSizeForm({
  portfolioId,
  tiers,
  currency,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  tiers: Tier[];
  currency: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<TierDraft[]>(() =>
    tierDrafts(tiers, currency),
  );

  function update(tier: string, patch: Partial<TierDraft>) {
    setRows((rs) => rs.map((r) => (r.tier === tier ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    try {
      await saveEquityMarketSize(
        portfolioId,
        // A tier left without a figure isn't saved at all — the read view and
        // the report only speak of tiers that say something.
        rows
          .filter((r) => r.value.trim() !== "")
          .map((r) => ({
            tier: r.tier,
            value: Number(r.value.replace(/,/g, "")),
            unit: r.unit,
            currency: r.currency,
          })),
      );
      onDone();
    } catch (err) {
      alert((err as Error).message || "Failed to save the market size");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className={cn("hidden sm:grid gap-2 px-0.5", GRID)}>
          {HEADINGS.map((h) => (
            <span key={h} className={labelCls}>
              {h}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.tier} className={cn("grid gap-2 items-start", GRID)}>
            <div className={readCellCls}>{marketTierName(row.tier)}</div>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={row.value}
              onChange={(e) => update(row.tier, { value: e.target.value })}
              placeholder="1.3"
              className={inputCls}
            />
            <select
              value={row.unit}
              onChange={(e) => update(row.tier, { unit: e.target.value })}
              className={inputCls}
            >
              {MARKET_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
            <select
              value={row.currency}
              onChange={(e) => update(row.tier, { currency: e.target.value })}
              className={inputCls}
            >
              <option value="">none</option>
              {MARKET_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
