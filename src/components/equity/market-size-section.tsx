"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
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

/** Matches the field list below, plus a trailing column for the remove button. */
const GRID =
  "sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_minmax(0,1.2fr)_1.75rem]";

const FIELDS: {
  key: "tier" | "amount" | "covers" | "meaning";
  label: string;
  placeholder: string;
}[] = [
  { key: "tier", label: "Tier", placeholder: "Total available market" },
  { key: "amount", label: "Amount", placeholder: "$2+ billion" },
  { key: "covers", label: "What it counts", placeholder: "trips booked worldwide" },
  {
    key: "meaning",
    label: "Why it's that big",
    placeholder: "everyone who books a trip online",
  },
];

type TierDraft = {
  /** Survives reordering and edits, which an index wouldn't. */
  key: string;
  tier: string;
  amount: string;
  covers: string;
  meaning: string;
};

let tierSeq = 0;

function blankTier(): TierDraft {
  tierSeq += 1;
  return { key: `tier-${tierSeq}`, tier: "", amount: "", covers: "", meaning: "" };
}

function tierToDraft(tier: Tier): TierDraft {
  return {
    ...blankTier(),
    tier: tier.tier ?? "",
    amount: tier.amount ?? "",
    covers: tier.covers ?? "",
    meaning: tier.meaning ?? "",
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
}: {
  portfolioId: string;
  tiers: Tier[];
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
      description="How big the market is, from the whole of it down to the part this project can reach. The amount is kept as it's written — the report reads a number out of it to draw the rings."
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
          <div className={cn("hidden sm:grid gap-2 px-0.5", GRID)}>
            {FIELDS.map((f) => (
              <span key={f.key} className={labelCls}>
                {f.label}
              </span>
            ))}
            <span />
          </div>
          {tiers.map((tier) => (
            <div key={tier.id} className={cn("grid gap-2 items-stretch", GRID)}>
              {FIELDS.map((f) => (
                <div key={f.key} className={readCellCls}>
                  <span className="whitespace-pre-wrap break-words">
                    {tier[f.key] || "—"}
                  </span>
                </div>
              ))}
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
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  tiers: Tier[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<TierDraft[]>(() =>
    tiers.length > 0 ? tiers.map(tierToDraft) : [blankTier()],
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
          amount: r.amount,
          covers: r.covers,
          meaning: r.meaning,
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
          {FIELDS.map((f) => (
            <span key={f.key} className={labelCls}>
              {f.label}
            </span>
          ))}
          <span />
        </div>

        {rows.map((row) => (
          <div key={row.key} className={cn("grid gap-2 items-start", GRID)}>
            {FIELDS.map((f) => (
              <input
                key={f.key}
                type="text"
                value={row[f.key]}
                onChange={(e) => update(row.key, { [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputCls}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setRows((rs) =>
                  rs.length === 1
                    ? [blankTier()]
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
          onClick={() => setRows((rs) => [...rs, blankTier()])}
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
