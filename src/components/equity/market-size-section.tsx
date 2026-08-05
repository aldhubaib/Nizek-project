"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import {
  MARKET_CURRENCIES,
  MARKET_UNITS,
  formatMarketAmount,
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

/** Name, number, unit, currency, then the remove button. */
const GRID = "sm:grid-cols-[minmax(0,1fr)_9rem_9rem_7rem_1.75rem]";

/** Read back, the three amount columns are one line of text again. */
const READ_GRID = "sm:grid-cols-[minmax(0,1fr)_minmax(0,25rem)_1.75rem]";

const HEADINGS = ["Name", "Number", "Unit", "Currency"];

type TierDraft = {
  /** Survives reordering and edits, which an index wouldn't. */
  key: string;
  tier: string;
  value: string;
  unit: string;
  currency: string;
};

let tierSeq = 0;

function blankTier(currency: string): TierDraft {
  tierSeq += 1;
  return {
    key: `tier-${tierSeq}`,
    tier: "",
    value: "",
    unit: "",
    currency,
  };
}

function tierToDraft(tier: Tier): TierDraft {
  return {
    ...blankTier(tier.currency ?? ""),
    tier: tier.tier ?? "",
    value: tier.value != null ? String(tier.value) : "",
    unit: tier.unit ?? "",
  };
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
            <span className={labelCls}>Name</span>
            <span className={labelCls}>Amount</span>
            <span />
          </div>
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={cn("grid gap-2 items-stretch", READ_GRID)}
            >
              <div className={readCellCls}>{tier.tier || "—"}</div>
              <div className={cn(readCellCls, "tabular-nums")}>
                {formatMarketAmount(tier)}
              </div>
              <span />
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
    tiers.length > 0 ? tiers.map(tierToDraft) : [blankTier(currency)],
  );

  function update(key: string, patch: Partial<TierDraft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    try {
      await saveEquityMarketSize(
        portfolioId,
        rows.map((r) => ({
          tier: r.tier,
          // An unreadable figure saves as nothing rather than as a guess; the
          // row keeps its name and the report leaves it out of the drawing.
          value: r.value.trim() === "" ? null : Number(r.value.replace(/,/g, "")),
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
          <span />
        </div>

        {rows.map((row) => (
          <div key={row.key} className={cn("grid gap-2 items-start", GRID)}>
            <input
              type="text"
              value={row.tier}
              onChange={(e) => update(row.key, { tier: e.target.value })}
              placeholder="Total available market"
              className={inputCls}
            />
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={row.value}
              onChange={(e) => update(row.key, { value: e.target.value })}
              placeholder="1.3"
              className={inputCls}
            />
            <select
              value={row.unit}
              onChange={(e) => update(row.key, { unit: e.target.value })}
              className={inputCls}
            >
              <option value="">as entered</option>
              {MARKET_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
            <select
              value={row.currency}
              onChange={(e) => update(row.key, { currency: e.target.value })}
              className={inputCls}
            >
              <option value="">none</option>
              {MARKET_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setRows((rs) =>
                  rs.length === 1
                    ? [blankTier(currency)]
                    : rs.filter((r) => r.key !== row.key),
                )
              }
              title="Remove tier"
              className="w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankTier(currency)])}
          className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add a tier
        </button>
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
