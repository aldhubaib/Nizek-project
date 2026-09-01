"use client";

// Entering a pack of figures: the pack's own details along the top, then a year
// of months across and the project's fields down the side.
//
// The shape follows the management reports the figures come from. Those arrive
// as a year with the months across it, and a form that asked for one month at a
// time would make somebody transpose a table by hand — which is where a figure
// lands in the wrong column.

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  formatMetricValue,
  formulaLabel,
  isDateMetric,
  isFieldAnswered,
  isFormulaMetric,
} from "@/lib/equity-math";
import {
  figureAt,
  formatMonth,
  formatPackLabel,
  monthKeysOfYear,
  monthStartOf,
  parsePastedNumber,
  resolveNumber,
  splitPastedGrid,
  ytdTotal,
  type MetricDef,
  type MonthlySeries,
  type MonthKey,
} from "@/lib/equity-financials";
import type { EquityMetricDTO } from "@/actions/equity";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const selectCls =
  "w-full h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";
const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** One field this project's reports ask for, and whether they insist on it. */
export type ReportField = { metric: EquityMetricDTO; required: boolean };

/** One uploaded statement on the form. The key is only for React's lists. */
export type PackDocumentDraft = {
  key: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
};

/**
 * A pack being written.
 *
 * Cells are held as the raw text typed rather than as parsed numbers, so a
 * half-typed "1,2" doesn't vanish mid-keystroke, and so blank stays
 * distinguishable from zero — the whole basis of what counts as reported.
 */
export type PackDraft = {
  /** "2026-07" — the pack's own month, which is what orders it against others. */
  reportedOn: string;
  audited: boolean;
  needsHelp: boolean;
  helpNotes: string;
  /** Which year's twelve columns are on screen. */
  year: number;
  /** `${metricId}|${monthKey}` → what was typed in that cell. */
  cells: Record<string, string>;
  documents: PackDocumentDraft[];
};

let packDocumentSeq = 0;
export function packDocumentKey(): string {
  packDocumentSeq += 1;
  return `packdoc-${packDocumentSeq}`;
}

export function cellKey(metricId: string, month: MonthKey): string {
  return `${metricId}|${month}`;
}

/** A pack of nothing, dated this month and showing this year. */
export function emptyPackDraft(): PackDraft {
  const now = new Date();
  return {
    reportedOn: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    audited: false,
    needsHelp: false,
    helpNotes: "",
    year: now.getUTCFullYear(),
    cells: {},
    documents: [],
  };
}

/**
 * An existing pack opened for editing.
 *
 * The grid opens on the latest year the pack has figures for rather than on
 * today's. A pack filed last year is edited where its figures actually are, not
 * on a blank grid that looks like the figures were lost.
 */
export function packToDraft(pack: {
  reportedOn: string;
  audited: boolean;
  needsHelp: boolean;
  helpNotes: string | null;
  values: {
    metricId: string;
    month: string;
    numberValue: number | null;
    dateValue: string | null;
  }[];
  documents: { filename: string; url: string; fileSize: number | null; mimeType: string | null }[];
}): PackDraft {
  const cells: Record<string, string> = {};
  const years = new Set<number>();

  for (const value of pack.values) {
    const date = new Date(value.month);
    if (Number.isNaN(date.getTime())) continue;
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    years.add(date.getUTCFullYear());
    cells[cellKey(value.metricId, month)] =
      value.dateValue?.slice(0, 10) ?? value.numberValue?.toString() ?? "";
  }

  const reported = new Date(pack.reportedOn);
  return {
    reportedOn: `${reported.getUTCFullYear()}-${String(reported.getUTCMonth() + 1).padStart(2, "0")}`,
    audited: pack.audited,
    needsHelp: pack.needsHelp,
    helpNotes: pack.helpNotes ?? "",
    year: years.size > 0 ? Math.max(...years) : reported.getUTCFullYear(),
    cells,
    documents: pack.documents.map((d) => ({ key: packDocumentKey(), ...d })),
  };
}

/**
 * The draft as the server takes it: one row per filled cell.
 *
 * Empty cells are dropped rather than sent as nulls. A grid opened on a year
 * nobody reported would otherwise file twelve months of blank claims, and the
 * analysis can't tell a filed blank from a reported zero.
 */
export function packPayload(draft: PackDraft, fields: ReportField[]) {
  const byId = new Map(fields.map((f) => [f.metric.id, f.metric]));

  const values: {
    metricId: string;
    month: string;
    numberValue: number | null;
    dateValue: string | null;
  }[] = [];

  for (const [key, raw] of Object.entries(draft.cells)) {
    const text = raw.trim();
    if (!text) continue;

    const [metricId, month] = key.split("|");
    const metric = byId.get(metricId ?? "");
    // A calculated field is read, never entered, so it has nothing to send.
    if (!metric || isFormulaMetric(metric.type)) continue;

    const monthStart = monthStartOf(month ?? "");
    if (!monthStart) continue;

    if (isDateMetric(metric.type)) {
      values.push({ metricId, month: monthStart, numberValue: null, dateValue: text });
      continue;
    }

    const number = parsePastedNumber(text);
    if (number == null) continue;
    values.push({ metricId, month: monthStart, numberValue: number, dateValue: null });
  }

  return {
    reportedOn: `${draft.reportedOn}-01T00:00:00.000Z`,
    audited: draft.audited,
    needsHelp: draft.needsHelp,
    helpNotes: draft.helpNotes.trim() || null,
    values,
    documents: draft.documents.map((d) => ({
      filename: d.filename,
      url: d.url,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
    })),
  };
}

/** Which months this draft says anything about, oldest first. */
function draftMonths(draft: PackDraft): MonthKey[] {
  const months = new Set<MonthKey>();
  for (const [key, raw] of Object.entries(draft.cells)) {
    if (!raw.trim()) continue;
    const month = key.split("|")[1];
    if (month) months.add(month);
  }
  return [...months].sort();
}

/** The form itself. Reached through MonthlyFiguresDialog, which frames it. */
function MonthlyFiguresGrid({
  initial,
  currency,
  metrics,
  fields,
  otherPacks,
  enforceRequired,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PackDraft;
  currency: string;
  metrics: EquityMetricDTO[];
  fields: ReportField[];
  /**
   * Every other pack on the project, resolved so a cell can say when a later
   * one has already restated it — editing a figure nobody reads any more should
   * not look like editing the figure the analysis uses.
   */
  otherPacks: MonthlySeries;
  enforceRequired: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: PackDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PackDraft>(initial);
  const [pasting, setPasting] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const uploading = uploadPct !== null;

  const months = useMemo(() => monthKeysOfYear(draft.year), [draft.year]);
  const registry = useMemo(
    () => new Map<string, MetricDef>(metrics.map((m) => [m.id, m])),
    [metrics],
  );

  function set<K extends keyof PackDraft>(key: K, value: PackDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setCell(metricId: string, month: MonthKey, raw: string) {
    setDraft((d) => ({ ...d, cells: { ...d.cells, [cellKey(metricId, month)]: raw } }));
  }

  async function uploadDocuments(files: File[]) {
    if (files.length === 0) return;
    setUploadPct(0);
    try {
      // One at a time so the counter means something; a failure stops the batch
      // where it happened rather than losing the files already through.
      for (const file of files) {
        const uploaded = await uploadFileToR2(file, setUploadPct);
        setDraft((d) => ({
          ...d,
          documents: [...d.documents, { key: packDocumentKey(), ...uploaded }],
        }));
      }
    } catch (err) {
      alert((err as Error).message || "Upload failed");
    } finally {
      setUploadPct(null);
      if (documentInputRef.current) documentInputRef.current.value = "";
    }
  }

  const documentsPasteRef = usePasteFiles(
    (files) => {
      void uploadDocuments(files);
    },
    { enabled: !busy && !uploading, capture: true },
  );

  /**
   * What each column works out to, calculated fields included.
   *
   * Recomputed from the typed text as you go, so a formula row answers while the
   * figures under it are still being entered — which is when a wrong sign or a
   * misplaced thousand is easiest to catch.
   */
  const columns = useMemo(() => {
    const byMonth = new Map<MonthKey, Map<string, number | null>>();
    for (const month of months) {
      const memo = new Map<string, number | null>();
      const stored = (metricId: string) =>
        parsePastedNumber(draft.cells[cellKey(metricId, month)] ?? "");
      const resolved = new Map<string, number | null>();
      for (const { metric } of fields) {
        resolved.set(metric.id, resolveNumber(metric.id, registry, stored, memo));
      }
      byMonth.set(month, resolved);
    }
    return byMonth;
  }, [months, fields, draft.cells, registry]);

  const filledMonths = draftMonths(draft);

  /**
   * A month the pack states while leaving a required field blank.
   *
   * Checked per month, matching the server: a pack covering January to July is
   * seven months of reporting, and a July missing revenue is unfinished whatever
   * the other six say. A month the pack says nothing about isn't missing
   * anything — it isn't claiming to cover it.
   */
  const incomplete = useMemo(() => {
    const required = fields.filter((f) => f.required && !isFormulaMetric(f.metric.type));
    if (required.length === 0) return [];

    return filledMonths.flatMap((month) => {
      const missing = required.filter(({ metric }) => {
        const raw = (draft.cells[cellKey(metric.id, month)] ?? "").trim();
        return !isFieldAnswered(metric, {
          numberValue: isDateMetric(metric.type) ? null : parsePastedNumber(raw),
          dateValue: isDateMetric(metric.type) ? raw || null : null,
        });
      });
      return missing.length > 0 ? [{ month, names: missing.map((f) => f.metric.name) }] : [];
    });
  }, [fields, filledMonths, draft.cells]);

  const validReportedOn = /^\d{4}-\d{2}$/.test(draft.reportedOn);

  const blocked = !validReportedOn
    ? "Set the date this report was received"
    : filledMonths.length === 0
      ? "Fill in at least one month"
      : enforceRequired && incomplete.length > 0
        ? `${formatMonth(incomplete[0].month)} is missing ${incomplete[0].names.join(", ")}`
        : null;

  // Said rather than enforced on an existing pack: the figures were entered
  // before the field was required, and there may be nobody left to ask.
  const warning =
    !enforceRequired && incomplete.length > 0
      ? `${incomplete.length} month${incomplete.length === 1 ? "" : "s"} still missing a required figure`
      : null;

  // A column at least as tall as the panel it scrolls in, so the footer below
  // can be pushed to the bottom of the screen on a project reporting three
  // fields and stick to it on one reporting thirty.
  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* ── The pack itself ── */}
      <div className="grid gap-3 @md/card:grid-cols-[minmax(0,200px)_minmax(0,200px)_minmax(0,1fr)]">
        <div>
          <label className={labelCls}>Report received</label>
          <input
            type="month"
            value={draft.reportedOn}
            onChange={(e) => set("reportedOn", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Audited</label>
          <select
            value={draft.audited ? "yes" : "no"}
            onChange={(e) => set("audited", e.target.value === "yes")}
            className={cn(
              selectCls,
              draft.audited && "bg-success/15 border-success/30 text-success",
            )}
          >
            <option value="no">Not audited</option>
            <option value="yes">Audited</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Figures for</label>
          <div className="flex items-center gap-2">
            <select
              value={draft.year}
              onChange={(e) => set("year", parseInt(e.target.value, 10))}
              className={cn(selectCls, "w-[110px] shrink-0")}
            >
              {yearOptions(draft).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {validReportedOn
                ? `Reported in ${formatPackLabel(`${draft.reportedOn}-01`)}. A month this report
                   restates keeps what the earlier one said, as history.`
                : "A report is dated by when it arrived, and states figures for whichever months it covers."}
            </p>
          </div>
        </div>
      </div>

      {/* ── The year grid ── */}
      {fields.length === 0 ? (
        <p className="text-s text-muted-foreground">
          This project isn&apos;t asked for any figures yet — choose them under Figures.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-s">
              <thead>
                <tr className="bg-muted/40">
                  {/* Sticky, because the field name is what makes a cell twelve
                      columns to the right mean anything. */}
                  <th className="sticky left-0 z-10 bg-muted/40 border-e border-border px-3 py-2 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-[180px]">
                    Field
                  </th>
                  {months.map((month) => (
                    <th
                      key={month}
                      className="px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-[92px]"
                    >
                      {formatMonth(month, false)}
                    </th>
                  ))}
                  <th className="border-s border-border px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-[100px]">
                    YTD
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map(({ metric, required }) => {
                  const formula = isFormulaMetric(metric.type);
                  const from = formula
                    ? formulaLabel(
                        metric.formulaOp,
                        metrics.find((m) => m.id === metric.leftId)?.name,
                        metrics.find((m) => m.id === metric.rightId)?.name,
                      )
                    : null;

                  const yearValues = months.map(
                    (month) => columns.get(month)?.get(metric.id) ?? null,
                  );

                  return (
                    <tr
                      key={metric.id}
                      className={cn(
                        "border-t border-border",
                        formula && "bg-primary/[0.04] font-medium",
                      )}
                    >
                      <th
                        className={cn(
                          "sticky left-0 z-10 border-e border-border bg-card px-3 py-1.5 text-start font-normal",
                          formula && "bg-primary/[0.04] font-medium",
                        )}
                      >
                        <span className="flex items-baseline gap-xs">
                          <span className="truncate text-foreground">{metric.name}</span>
                          {required && !formula && (
                            <span
                              className="text-destructive"
                              title="Required on this project's reports"
                            >
                              *
                            </span>
                          )}
                        </span>
                        {from && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {from}
                          </span>
                        )}
                      </th>

                      {months.map((month, i) => (
                        <td key={month} className="px-1 py-1">
                          {formula ? (
                            <span className="block px-1 text-end tabular-nums text-foreground">
                              {yearValues[i] == null
                                ? "—"
                                : formatMetricValue(metric, { numberValue: yearValues[i] })}
                            </span>
                          ) : (
                            <Cell
                              metric={metric}
                              month={month}
                              value={draft.cells[cellKey(metric.id, month)] ?? ""}
                              onChange={(raw) => setCell(metric.id, month, raw)}
                              standing={cellStanding(
                                otherPacks,
                                metric,
                                month,
                                draft.reportedOn,
                              )}
                              disabled={busy}
                            />
                          )}
                        </td>
                      ))}

                      <td className="border-s border-border px-3 py-1.5 text-end tabular-nums text-foreground">
                        {isDateMetric(metric.type)
                          ? "—"
                          : (() => {
                              const total = ytdTotal(yearValues);
                              return total == null
                                ? "—"
                                : formatMetricValue(metric, { numberValue: total });
                            })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setPasting((p) => !p)}
              className={cn(
                "flex items-center gap-xs rounded-lg border px-3 py-1.5 text-s font-medium transition-colors",
                pasting
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              Paste figures
            </button>
            <p className="text-xs text-muted-foreground">
              Amounts in {currency} unless the field says otherwise. A blank month is a month
              nobody reported, which is not the same as a month of zero — enter 0 if that&apos;s
              the figure.
            </p>
          </div>

          {pasting && (
            <PasteFigures
              fields={fields}
              months={months}
              onApply={(cells) => {
                setDraft((d) => ({ ...d, cells: { ...d.cells, ...cells } }));
                setPasting(false);
              }}
              onCancel={() => setPasting(false)}
            />
          )}
        </div>
      )}

      {/* ── Help and documents ── */}
      <div className="grid gap-3 @md/card:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelCls}>Do they need help?</label>
          <select
            value={draft.needsHelp ? "yes" : "no"}
            onChange={(e) => set("needsHelp", e.target.value === "yes")}
            className={cn(
              selectCls,
              draft.needsHelp && "bg-orange/15 border-orange/30 text-orange",
            )}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        {draft.needsHelp && (
          <div>
            <label className={labelCls}>What do they need?</label>
            <input
              type="text"
              value={draft.helpNotes}
              onChange={(e) => set("helpNotes", e.target.value)}
              placeholder="e.g. intros to investors, hiring a senior backend engineer"
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* The statements the figures were read from, kept with the pack so a
          figure can always be checked against its source. */}
      <div>
        <label className={labelCls}>Financial documents</label>
        <div ref={documentsPasteRef} className="space-y-1.5">
          {draft.documents.map((doc) => (
            <div
              key={doc.key}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-s text-foreground no-underline hover:underline"
              >
                {doc.filename}
              </a>
              {formatFileSize(doc.fileSize) && (
                <span className="shrink-0 text-xs text-muted-foreground/60">
                  {formatFileSize(doc.fileSize)}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    documents: d.documents.filter((x) => x.key !== doc.key),
                  }))
                }
                disabled={busy}
                className="ms-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Remove this document"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => documentInputRef.current?.click()}
            disabled={busy || uploading}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-dashed border-border bg-card px-3 text-s text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
            {uploading
              ? `Uploading… ${uploadPct}%`
              : "Upload or paste the report these figures came from (PDF, spreadsheet, image)"}
          </button>
          <input
            ref={documentInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
            onChange={(e) => void uploadDocuments(Array.from(e.target.files ?? []))}
            className="hidden"
          />
        </div>
      </div>

      {/* Stuck to the bottom of the scrolling panel: a year of figures is taller
          than the screen, and the reason a save is refused is written here, so
          neither may scroll out of sight while the grid is being filled. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        {blocked ? (
          <span className="me-auto text-xs text-muted-foreground">{blocked}</span>
        ) : (
          warning && <span className="me-auto text-xs text-orange">{warning}</span>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-9 rounded-lg px-3 text-s text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || uploading || blocked != null}
          className="h-9 rounded-lg bg-primary px-3 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The grid on its own screen.
 *
 * A year of figures is thirteen columns and as many rows as the project reports,
 * which is wider and taller than the card it is opened from — inline, the table
 * scrolled sideways inside a column of other content and the pack header sat
 * above the fold. Full-screen gives the grid the whole viewport, which is what
 * it needs to read like the statement it was copied from.
 *
 * Deliberately not dismissed by Escape or a backdrop click, unlike the small
 * confirm dialogs elsewhere: this form holds a year of hand-entered figures and
 * one stray keypress must not be able to throw them away. Leaving is explicit,
 * through Close or Cancel.
 */
export function MonthlyFiguresDialog({
  title,
  ...grid
}: { title: string } & Parameters<typeof MonthlyFiguresGrid>[0]) {
  useScrollLock(true);

  if (typeof document === "undefined") return null;

  // Portalled to the body, so the card's own stacking and overflow can't clip a
  // panel that is meant to cover the page.
  return createPortal(
    <div data-scroll-lock-root className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <div className="app-top-bar flex shrink-0 items-center gap-3 border-b border-border">
        <button
          type="button"
          onClick={grid.onCancel}
          disabled={grid.busy}
          className="flex items-center gap-xs text-s text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
          Close
        </button>
        <span className="text-border">|</span>
        <span className="truncate text-s font-semibold text-foreground">{title}</span>
      </div>

      {/* The container the grid's @md/card: rules measure against, which inside
          the card was the card itself. */}
      <div className="app-card flex-1 overflow-y-auto p-4">
        <MonthlyFiguresGrid {...grid} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * The years the grid offers: the last few, plus every year this pack already has
 * figures in, so a pack covering a year nobody expected can still be reached.
 */
function yearOptions(draft: PackDraft): number[] {
  const now = new Date().getUTCFullYear();
  const years = new Set<number>([draft.year]);
  for (let y = now + 1; y >= now - 6; y--) years.add(y);
  for (const month of draftMonths(draft)) {
    const year = parseInt(month.slice(0, 4), 10);
    if (Number.isFinite(year)) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/** How this cell stands against what the other packs say about the same month. */
type CellStanding =
  | { kind: "superseded"; label: string; value: string }
  | { kind: "restates"; label: string; value: string };

/**
 * Whether another pack also states this month, and which of the two wins.
 *
 * Both directions are worth marking, and they mean opposite things. Editing a
 * cell a *later* pack has already corrected is editing history — the analysis
 * won't move, and without the mark the edit would seem to have no effect
 * anywhere. Editing a cell that corrects an *earlier* pack is the opposite: it
 * is about to change the figure everything reads, and what it replaces is worth
 * seeing while you type over it.
 */
function cellStanding(
  others: MonthlySeries,
  metric: EquityMetricDTO,
  month: MonthKey,
  reportedOn: string,
): CellStanding | null {
  const other = figureAt(others, metric.id, month);
  if (!other) return null;

  const mine = new Date(`${reportedOn}-01T00:00:00.000Z`).getTime();
  const theirs = new Date(other.reportedOn).getTime();
  if (Number.isNaN(mine)) return null;

  return {
    kind: theirs > mine ? "superseded" : "restates",
    label: formatPackLabel(other.reportedOn),
    value: formatMetricValue(metric, other),
  };
}

function Cell({
  metric,
  month,
  value,
  onChange,
  standing,
  disabled,
}: {
  metric: EquityMetricDTO;
  month: MonthKey;
  value: string;
  onChange: (raw: string) => void;
  standing: CellStanding | null;
  disabled: boolean;
}) {
  const title = !standing
    ? `${metric.name}, ${formatMonth(month)}`
    : standing.kind === "superseded"
      ? `The ${standing.label} report restated this to ${standing.value} — that is the figure the analysis uses`
      : `This restates the ${standing.label} report, which said ${standing.value}`;

  if (isDateMetric(metric.type)) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        className="h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-xs text-foreground hover:border-border focus:border-primary/40 focus:outline-none"
      />
    );
  }

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        className={cn(
          "h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-end text-s tabular-nums text-foreground hover:border-border focus:border-primary/40 focus:outline-none",
          // A figure nobody reads any more is dimmed; one that overrides an
          // earlier pack is not, because it is the live figure.
          standing?.kind === "superseded" && "text-muted-foreground",
        )}
      />
      {standing && (
        // A corner dot rather than a colour on the text, so it survives beside
        // the required-field asterisk and still reads on twelve narrow cells.
        <span
          aria-hidden
          title={title}
          className={cn(
            "pointer-events-none absolute end-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
            standing.kind === "superseded" ? "bg-muted-foreground/60" : "bg-orange/70",
          )}
        />
      )}
    </span>
  );
}

// ─── Pasting a block ────────────────────────────────────────────────────────

const PASTE_PLACEHOLDER = `Revenue (net)\t45,000\t52,000\t61,500
Cost of sales\t(18,000)\t(21,400)\t(24,000)
G&A expenses\t(9,200)\t(9,400)\t(9,900)`;

/**
 * Fill the grid from a block copied out of the report.
 *
 * Rows are matched to fields by name, and columns to months in order from a
 * chosen starting month. Nothing is applied until the preview has been read:
 * a paste that silently matched the wrong row would put a cost line into
 * revenue, and the total would still look plausible.
 */
function PasteFigures({
  fields,
  months,
  onApply,
  onCancel,
}: {
  fields: ReportField[];
  months: MonthKey[];
  onApply: (cells: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [startMonth, setStartMonth] = useState<MonthKey>(months[0]);

  const enterable = fields.filter((f) => !isFormulaMetric(f.metric.type));

  const parsed = useMemo(() => {
    const startAt = months.indexOf(startMonth);
    const byName = new Map(
      enterable.map((f) => [normaliseName(f.metric.name), f.metric] as const),
    );

    const matched: { name: string; metric: EquityMetricDTO; figures: (number | null)[] }[] = [];
    const unmatched: string[] = [];

    for (const row of splitPastedGrid(text)) {
      const [label, ...rest] = row;
      if (!label) continue;
      const metric = byName.get(normaliseName(label));
      if (!metric) {
        unmatched.push(label);
        continue;
      }
      // Only as many columns as there are months left in the year; a block
      // wider than that is a paste that started in the wrong month.
      matched.push({
        name: label,
        metric,
        figures: rest.slice(0, months.length - startAt).map(parsePastedNumber),
      });
    }

    const cells: Record<string, string> = {};
    let filled = 0;
    for (const row of matched) {
      row.figures.forEach((figure, i) => {
        if (figure == null) return;
        const month = months[startAt + i];
        if (!month) return;
        cells[cellKey(row.metric.id, month)] = String(figure);
        filled += 1;
      });
    }

    return { matched, unmatched, cells, filled };
  }, [text, enterable, months, startMonth]);

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>First column is</label>
          <select
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className={cn(selectCls, "w-[130px]")}
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
        </div>
        <p className="flex-1 min-w-[240px] pb-2 text-xs text-muted-foreground">
          One line per field, starting with its name, then a figure per month. Tabs or two or
          more spaces separate the columns, and brackets read as a negative.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PASTE_PLACEHOLDER}
        rows={6}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-border bg-field px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/50"
      />

      {parsed.matched.length > 0 && (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">
            {parsed.filled} figure{parsed.filled === 1 ? "" : "s"} across{" "}
            {parsed.matched.length} field{parsed.matched.length === 1 ? "" : "s"}
          </p>
          {parsed.matched.slice(0, 6).map((row) => (
            <p key={row.metric.id} className="truncate text-xs text-muted-foreground">
              • {row.metric.name}:{" "}
              {row.figures
                .map((f) => (f == null ? "—" : f.toLocaleString("en-US")))
                .join(", ")}
            </p>
          ))}
          {parsed.matched.length > 6 && (
            <p className="text-xs text-muted-foreground">
              • and {parsed.matched.length - 6} more
            </p>
          )}
        </div>
      )}

      {parsed.unmatched.length > 0 && (
        <div className="space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-xs font-medium text-destructive">
            {parsed.unmatched.length} line{parsed.unmatched.length === 1 ? "" : "s"} match no
            field this project reports — skipped
          </p>
          {parsed.unmatched.slice(0, 4).map((name, i) => (
            <p key={`${name}-${i}`} className="truncate text-xs text-destructive/80">
              • {name}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg px-3 text-s text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(parsed.cells)}
          disabled={parsed.filled === 0}
          className="flex h-8 items-center gap-xs rounded-lg bg-primary px-3 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          Fill {parsed.filled} cell{parsed.filled === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

/** Loose enough that "G&A Expenses" finds "G&A expenses" pasted out of a PDF. */
function normaliseName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}
