"use client";

import { useEffect, useState, useTransition } from "react";
import { Coins, Loader2, Star, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteCurrencyRate,
  getCurrencyRates,
  saveCurrencyRate,
  setBaseCurrency,
} from "@/actions/currency-rates";
import type { RateRow } from "@/lib/equity-financials";

/**
 * Admin settings: the rates a cross-project financial total is added up
 * through.
 *
 * Typed in rather than fetched, on purpose. A portfolio total is opened months
 * after the figures were filed, and a live rate would make the same historical
 * total read differently every time you looked at it. The trade is that a rate
 * goes stale, which is visible here, rather than that a total changes silently,
 * which isn't.
 */
export function CurrencyRateManager() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [saving, startSaving] = useTransition();

  async function reload() {
    setRates(await getCurrencyRates());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getCurrencyRates();
      if (cancelled) return;
      setRates(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const base = rates.find((r) => r.isBase) ?? null;

  function run(action: () => Promise<void>) {
    setError("");
    startSaving(async () => {
      try {
        await action();
        await reload();
      } catch (err) {
        setError((err as Error).message || "That didn't save");
      }
    });
  }

  function add() {
    const value = parseFloat(rate);
    if (!code.trim() || !Number.isFinite(value)) return;
    run(async () => {
      await saveCurrencyRate(code, value);
      setCode("");
      setRate("");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-s font-semibold">
          <Coins className="h-4 w-4 text-muted-foreground" />
          Exchange rates
        </h2>
        <p className="mt-1 text-s text-muted-foreground">
          What one unit of each currency is worth in the base currency, used to add financial
          figures up across projects that don&apos;t report in the same one. A project whose
          currency isn&apos;t listed here is named and left out of the portfolio total rather
          than folded in unconverted.
          {base
            ? ` Everything totals in ${base.code}.`
            : " No base currency is set, so nothing can be totalled yet."}
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1">
          {rates.map((row) => (
            <div
              key={row.code}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2",
                row.isBase ? "border-primary/30 bg-primary/5" : "border-border",
              )}
            >
              <span className="w-12 shrink-0 font-mono text-s font-medium text-foreground">
                {row.code}
              </span>

              {row.isBase ? (
                <span className="flex-1 text-s text-muted-foreground">
                  The base — every other rate is quoted against it, so its own rate is 1.
                </span>
              ) : (
                <>
                  <Input
                    defaultValue={String(row.rate)}
                    onBlur={(e) => {
                      const next = parseFloat(e.target.value);
                      if (!Number.isFinite(next) || next === row.rate) return;
                      run(() => saveCurrencyRate(row.code, next));
                    }}
                    inputMode="decimal"
                    className="h-8 w-28 font-mono text-s"
                    aria-label={`${row.code} rate`}
                  />
                  <span className="flex-1 text-xs text-muted-foreground">
                    1 {row.code} = {row.rate} {base?.code ?? "base"}
                  </span>
                  <button
                    type="button"
                    onClick={() => run(() => setBaseCurrency(row.code))}
                    disabled={saving}
                    title={`Make ${row.code} the base currency`}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => deleteCurrencyRate(row.code))}
                    disabled={saving}
                    title={`Remove ${row.code}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="USD"
              className="h-8 w-20 font-mono text-s"
              aria-label="Currency code"
            />
            <Input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={`Worth in ${base?.code ?? "base"}`}
              inputMode="decimal"
              className="h-8 w-40 text-s"
              aria-label="Rate"
            />
            <Button size="sm" onClick={add} disabled={saving} className="h-8 px-3">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-s text-destructive">{error}</p>}
    </div>
  );
}
