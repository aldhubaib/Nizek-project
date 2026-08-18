"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BarChart3, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddButton } from "@/components/add-button";
import {
  EQUITY_FORMULA_OP,
  EQUITY_METRIC_GROUP,
  EQUITY_METRIC_TYPE,
  formulaLabel,
  isDateMetric,
  isFormulaMetric,
} from "@/lib/equity-math";
import {
  addEquityMetric,
  updateEquityMetric,
  deleteEquityMetric,
  type EquityMetricDTO,
} from "@/actions/equity";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const selectCls = cn(inputCls, "appearance-none pe-8");

type Draft = {
  name: string;
  type: string;
  unit: string;
  formulaOp: string;
  leftId: string;
  rightId: string;
};

const EMPTY: Draft = {
  name: "",
  type: "NUMBER",
  unit: "",
  formulaOp: "SUBTRACT",
  leftId: "",
  rightId: "",
};

/** What a calculated field is allowed to stand on: plain figures beside it. */
function operandsIn(metrics: EquityMetricDTO[], group: string, selfId?: string) {
  return metrics.filter(
    (m) =>
      m.group === group &&
      m.id !== selfId &&
      !isFormulaMetric(m.type) &&
      !isDateMetric(m.type),
  );
}

/**
 * The name, the type and — for a plain figure — what it counts. A percentage
 * carries its own sign and a date has no unit, so the field only appears where
 * it means something. A calculated field trades the unit box for the two fields
 * and the operator it's worked out from.
 */
function MetricFields({
  draft,
  onChange,
  operands,
  autoFocus,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  /** The fields this one may be calculated from, if it's a calculation. */
  operands: EquityMetricDTO[];
  autoFocus?: boolean;
}) {
  const formula = draft.type === "FORMULA";

  return (
    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="e.g. Monthly active users"
        autoFocus={autoFocus}
        className={cn(inputCls, "flex-1 min-w-[12rem]")}
      />
      <select
        value={draft.type}
        onChange={(e) => onChange({ ...draft, type: e.target.value })}
        className={cn(selectCls, "w-32 shrink-0")}
      >
        {Object.entries(EQUITY_METRIC_TYPE).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {draft.type === "NUMBER" && (
        <input
          type="text"
          value={draft.unit}
          onChange={(e) => onChange({ ...draft, unit: e.target.value })}
          placeholder="Unit"
          className={cn(inputCls, "w-24 shrink-0")}
        />
      )}

      {formula && (
        <>
          <select
            value={draft.leftId}
            onChange={(e) => onChange({ ...draft, leftId: e.target.value })}
            className={cn(selectCls, "w-36 shrink-0")}
          >
            <option value="">First field…</option>
            {operands.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={draft.formulaOp}
            onChange={(e) => onChange({ ...draft, formulaOp: e.target.value })}
            className={cn(selectCls, "w-16 shrink-0 text-center")}
          >
            {Object.entries(EQUITY_FORMULA_OP).map(([value, symbol]) => (
              <option key={value} value={value}>
                {symbol}
              </option>
            ))}
          </select>
          <select
            value={draft.rightId}
            onChange={(e) => onChange({ ...draft, rightId: e.target.value })}
            className={cn(selectCls, "w-36 shrink-0")}
          >
            <option value="">Second field…</option>
            {operands.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={draft.unit}
            onChange={(e) => onChange({ ...draft, unit: e.target.value })}
            placeholder="Unit"
            className={cn(inputCls, "w-24 shrink-0")}
          />
        </>
      )}
    </div>
  );
}

/** "3 values" / "unused" — also the reason a row refuses to be deleted. */
function usage(count: number) {
  if (count === 0) return "unused";
  return `${count} value${count === 1 ? "" : "s"}`;
}

/**
 * The fields a project is tracked on, defined once and shared by every
 * portfolio. Nothing is recorded here — this is the vocabulary the Performance
 * and Financials sections pick from, so "Sign-ups" means one thing across all
 * projects and a rename follows every figure already recorded.
 *
 * The two groups are one registry because they're the same idea: a named figure
 * written down over and over. What separates them is only when they're asked
 * for — a reading taken on a day, or a period being closed.
 */
export function EquityMetricManager({ metrics }: { metrics: EquityMetricDTO[] }) {
  return (
    <div className="space-y-3">
      <MetricGroup
        group="PERFORMANCE"
        icon={Activity}
        description="What a project can be measured on — users, churn, the day something shipped. Recorded per project under Performance, one dated reading at a time."
        metrics={metrics}
      />
      <MetricGroup
        group="FINANCIAL"
        icon={BarChart3}
        description="What a period is reported with — revenue, cost, cash in bank. Recorded per project under Financials, one closed quarter or year at a time. A calculated field is worked out from two others every time it's read, so it can never disagree with them."
        metrics={metrics}
      />
    </div>
  );
}

function MetricGroup({
  group,
  icon: Icon,
  description,
  metrics,
}: {
  group: string;
  icon: typeof Activity;
  description: string;
  metrics: EquityMetricDTO[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const rows = metrics.filter((m) => m.group === group);
  const byId = new Map(metrics.map((m) => [m.id, m]));

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      alert((err as Error).message || failure);
    } finally {
      setBusy(false);
    }
  }

  const payload = (d: Draft) => ({
    name: d.name.trim(),
    group,
    type: d.type,
    unit: d.unit,
    formulaOp: d.formulaOp,
    leftId: d.leftId || null,
    rightId: d.rightId || null,
  });

  async function add() {
    if (!draft.name.trim()) return;
    await run(async () => {
      await addEquityMetric(payload(draft));
      setDraft(EMPTY);
    }, "Failed to add");
  }

  async function save(id: string) {
    if (!editDraft.name.trim()) return;
    await run(async () => {
      await updateEquityMetric(id, payload(editDraft));
      setEditingId(null);
    }, "Failed to save");
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-s font-semibold text-foreground">
          {EQUITY_METRIC_GROUP[group as keyof typeof EQUITY_METRIC_GROUP]} data
        </h2>
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {rows.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>

      <div className="flex items-start gap-2 mb-3">
        <MetricFields
          draft={draft}
          onChange={setDraft}
          operands={operandsIn(metrics, group)}
        />
        <AddButton
          label="Add"
          onClick={add}
          disabled={busy || !draft.name.trim()}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-s text-muted-foreground py-1">
          No fields yet.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((metric) =>
            editingId === metric.id ? (
              <div key={metric.id} className="flex items-start gap-2">
                <MetricFields
                  draft={editDraft}
                  onChange={setEditDraft}
                  operands={operandsIn(metrics, group, metric.id)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => save(metric.id)}
                  disabled={busy || !editDraft.name.trim()}
                  className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-s font-medium disabled:opacity-40 transition-colors shrink-0"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-3 h-9 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                key={metric.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
              >
                <span className="flex-1 min-w-0 truncate text-s text-foreground">
                  {metric.name}
                  {metric.unit && !isDateMetric(metric.type) && (
                    <span className="ms-1.5 text-xs text-muted-foreground">
                      {metric.unit}
                    </span>
                  )}
                  {isFormulaMetric(metric.type) && (
                    <span className="ms-1.5 text-xs text-muted-foreground">
                      {formulaLabel(
                        metric.formulaOp,
                        byId.get(metric.leftId ?? "")?.name,
                        byId.get(metric.rightId ?? "")?.name,
                      ) ?? "needs two fields"}
                    </span>
                  )}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground font-medium shrink-0">
                  {EQUITY_METRIC_TYPE[
                    metric.type as keyof typeof EQUITY_METRIC_TYPE
                  ] ?? metric.type}
                </span>
                <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">
                  {isFormulaMetric(metric.type)
                    ? "worked out"
                    : usage(metric.valueCount)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(metric.id);
                    setEditDraft({
                      name: metric.name,
                      type: metric.type,
                      unit: metric.unit ?? "",
                      formulaOp: metric.formulaOp ?? "SUBTRACT",
                      leftId: metric.leftId ?? "",
                      rightId: metric.rightId ?? "",
                    });
                  }}
                  disabled={busy}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={`Edit ${metric.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirm(`Remove ${metric.name} from the list?`) &&
                    run(
                      () => deleteEquityMetric(metric.id),
                      "Failed to remove",
                    )
                  }
                  disabled={busy}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Remove ${metric.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
