"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import {
  RecordDetail,
  RecordDetails,
  RecordRow,
  RowActions,
} from "@/components/equity/record-row";
import { formatMetricValue, isDateMetric } from "@/lib/equity-math";
import {
  addEquityPerformanceEntry,
  updateEquityPerformanceEntry,
  deleteEquityPerformanceEntry,
  type EquityMetricDTO,
  type EquityPortfolioDTO,
} from "@/actions/equity";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const selectCls = cn(inputCls, "appearance-none pr-8");

const labelCls =
  "block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide";

type Entry = EquityPortfolioDTO["performance"][number];

/** A row mid-edit: one metric and whichever value box its type calls for. */
type RowDraft = {
  /** Survives reordering and metric changes, which an index wouldn't. */
  key: string;
  metricId: string;
  number: string;
  date: string;
};

type EntryDraft = {
  recordedOn: string;
  notes: string;
  rows: RowDraft[];
};

let rowSeq = 0;
function blankRow(): RowDraft {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, metricId: "", number: "", date: "" };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEntry(): EntryDraft {
  return { recordedOn: today(), notes: "", rows: [blankRow()] };
}

function entryToDraft(entry: Entry): EntryDraft {
  return {
    recordedOn: entry.recordedOn.slice(0, 10),
    notes: entry.notes ?? "",
    rows: entry.values.map((v) => ({
      ...blankRow(),
      metricId: v.metricId,
      number: v.numberValue?.toString() ?? "",
      date: v.dateValue?.slice(0, 10) ?? "",
    })),
  };
}

function formatDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/**
 * One reading being written: the day it was taken, then a line per metric.
 * Which value box a line shows follows the metric picked on it, so the form
 * can't be used to file a date against a figure.
 */
function PerformanceForm({
  initial,
  metrics,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: EntryDraft;
  metrics: EquityMetricDTO[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: EntryDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  const filled = draft.rows.filter((r) => r.metricId);
  const duplicate = new Set(filled.map((r) => r.metricId)).size !== filled.length;

  function patchRow(key: string, patch: Partial<RowDraft>) {
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  const blocked = !draft.recordedOn
    ? "Pick the date this reading was taken"
    : filled.length === 0
      ? "Add at least one metric"
      : duplicate
        ? "A metric can only be recorded once per reading"
        : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4 mb-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={draft.recordedOn}
            onChange={(e) =>
              setDraft((d) => ({ ...d, recordedOn: e.target.value }))
            }
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="e.g. figures from the founders' monthly update"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Data
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Value
          </span>
          <span className="w-8" />
        </div>

        {draft.rows.map((row) => {
          const metric = metrics.find((m) => m.id === row.metricId);
          return (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center"
            >
              <select
                value={row.metricId}
                onChange={(e) => patchRow(row.key, { metricId: e.target.value })}
                className={selectCls}
              >
                <option value="">Pick a data point…</option>
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              {metric && isDateMetric(metric.type) ? (
                <input
                  type="date"
                  value={row.date}
                  onChange={(e) => patchRow(row.key, { date: e.target.value })}
                  className={inputCls}
                />
              ) : (
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={row.number}
                    onChange={(e) =>
                      patchRow(row.key, { number: e.target.value })
                    }
                    placeholder={metric ? "0" : "Pick a data point first"}
                    disabled={!metric}
                    className={cn(
                      inputCls,
                      "disabled:opacity-50",
                      metric?.type === "PERCENT" && "pr-7",
                      metric?.unit && metric.type === "NUMBER" && "pr-14",
                    )}
                  />
                  {metric?.type === "PERCENT" && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">
                      %
                    </span>
                  )}
                  {metric?.type === "NUMBER" && metric.unit && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none max-w-12 truncate">
                      {metric.unit}
                    </span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    rows:
                      d.rows.length === 1
                        ? [blankRow()]
                        : d.rows.filter((r) => r.key !== row.key),
                  }))
                }
                className="w-8 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Remove this line"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({ ...d, rows: [...d.rows, blankRow()] }))
          }
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add row
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        {blocked && (
          <span className="text-[11px] text-muted-foreground mr-auto">
            {blocked}
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || blocked != null}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * How a project is doing, in whatever terms it's worth watching in. Each entry
 * is one day's reading across the metrics defined under Performance data, so the same
 * figure recorded month after month becomes a series rather than a note.
 */
export function PerformanceSection({
  portfolio,
  metrics,
}: {
  portfolio: EquityPortfolioDTO;
  metrics: EquityMetricDTO[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = portfolio.performance;

  function payload(draft: EntryDraft) {
    return {
      recordedOn: draft.recordedOn,
      notes: draft.notes,
      values: draft.rows
        .filter((row) => row.metricId)
        .map((row) => ({
          metricId: row.metricId,
          numberValue: row.number.trim() === "" ? null : Number(row.number),
          dateValue: row.date || null,
        })),
    };
  }

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

  return (
    <CollapsibleCard
      icon={Activity}
      title="Performance"
      summary={entries.length > 0 ? entries.length : undefined}
      description="Where the project stands on the data points defined under Performance data — one dated reading at a time, so the same figure recorded again becomes a trend."
      forceOpen={adding || editingId !== null}
      actions={
        !adding &&
        metrics.length > 0 && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add reading
          </button>
        )
      }
    >
      {metrics.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          Nothing to record yet — define what a project is measured on under{" "}
          <Link
            href="/dashboard/equity"
            className="text-primary hover:underline"
          >
            Performance data
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          {adding && (
            <PerformanceForm
              initial={emptyEntry()}
              metrics={metrics}
              busy={busy}
              submitLabel="Add reading"
              onCancel={() => setAdding(false)}
              onSubmit={(draft) =>
                run(async () => {
                  await addEquityPerformanceEntry(portfolio.id, payload(draft));
                  setAdding(false);
                }, "Failed to add the reading")
              }
            />
          )}

          {entries.length === 0 && !adding && (
            <p className="text-[12px] text-muted-foreground py-2">
              No readings yet.
            </p>
          )}

          <div className="space-y-2">
            {entries.map((entry) =>
              editingId === entry.id ? (
                <PerformanceForm
                  key={entry.id}
                  initial={entryToDraft(entry)}
                  metrics={metrics}
                  busy={busy}
                  submitLabel="Save reading"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) =>
                    run(async () => {
                      await updateEquityPerformanceEntry(
                        entry.id,
                        payload(draft),
                      );
                      setEditingId(null);
                    }, "Failed to save the reading")
                  }
                />
              ) : (
                <RecordRow
                  key={entry.id}
                  title={formatDay(entry.recordedOn)}
                  meta={`${entry.values.length} ${
                    entry.values.length === 1 ? "metric" : "metrics"
                  }`}
                  actions={
                    <RowActions
                      label="Reading options"
                      disabled={busy}
                      onEdit={() => {
                        setEditingId(entry.id);
                        setAdding(false);
                      }}
                      onDelete={() =>
                        confirm("Delete this reading?") &&
                        run(
                          () => deleteEquityPerformanceEntry(entry.id),
                          "Failed to delete the reading",
                        )
                      }
                    />
                  }
                >
                  <RecordDetails>
                    {entry.values.map((value) => (
                      <RecordDetail
                        key={value.id}
                        label={value.metric.name}
                        value={formatMetricValue(value.metric, value)}
                      />
                    ))}
                    {entry.notes && (
                      <RecordDetail
                        label="Note"
                        span
                        value={
                          <span className="whitespace-pre-wrap text-muted-foreground">
                            {entry.notes}
                          </span>
                        }
                      />
                    )}
                  </RecordDetails>
                </RecordRow>
              ),
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
