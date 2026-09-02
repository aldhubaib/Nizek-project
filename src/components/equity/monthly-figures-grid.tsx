"use client";

// Entering a pack of figures: the pack's own details along the top, then a year
// of months across and the project's fields down the side.
//
// The shape follows the management reports the figures come from. Those arrive
// as a year with the months across it, and a form that asked for one month at a
// time would make somebody transpose a table by hand — which is where a figure
// lands in the wrong column.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Paperclip, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  formatMetricValue,
  formulaLabel,
  isDateMetric,
  isFormulaMetric,
} from "@/lib/equity-math";
import {
  figureAt,
  formatMonth,
  formatPackLabel,
  monthKeysOfYear,
  parsePastedNumber,
  resolveNumber,
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
  /** Which year's twelve columns are on screen. */
  year: number;
  /** `${metricId}|${monthKey}` → what was typed in that cell. */
  cells: Record<string, string>;
  documents: PackDocumentDraft[];
};

/**
 * The draft as it is stored — the same thing without the list keys, which are
 * React's business and mean nothing once the pack is written down.
 */
export function packDraftToStored(draft: PackDraft) {
  return {
    reportedOn: draft.reportedOn,
    audited: draft.audited,
    year: draft.year,
    cells: draft.cells,
    documents: draft.documents.map(({ filename, url, fileSize, mimeType }) => ({
      filename,
      url,
      fileSize,
      mimeType,
    })),
  };
}

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
    year: now.getUTCFullYear(),
    cells: {},
    documents: [],
  };
}

/** A pack as the page hands it over — either being entered, or already filed. */
export type StoredPack = {
  reportedOn: string;
  audited: boolean;
  publishedAt: string | null;
  draft: {
    reportedOn: string;
    audited: boolean;
    year: number;
    cells: Record<string, string>;
    documents: { filename: string; url: string; fileSize: number | null; mimeType: string | null }[];
  } | null;
  values: {
    metricId: string;
    month: string;
    numberValue: number | null;
    dateValue: string | null;
  }[];
  documents: { filename: string; url: string; fileSize: number | null; mimeType: string | null }[];
};

/**
 * An existing pack opened for editing.
 *
 * A saved working copy wins over the published figures, which is what makes
 * leaving and coming back the same as never having left — including for a pack
 * that was published and then edited again, where the two differ and the edit
 * is the one still being worked on.
 *
 * Failing that, the grid is filled from what the pack published, and opens on
 * the latest year it has figures for rather than on today's. A pack filed last
 * year is edited where its figures actually are, not on a blank grid that looks
 * like the figures were lost.
 */
export function packToDraft(pack: StoredPack): PackDraft {
  if (pack.draft) {
    return {
      ...pack.draft,
      documents: pack.draft.documents.map((d) => ({ key: packDocumentKey(), ...d })),
    };
  }

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
    year: years.size > 0 ? Math.max(...years) : reported.getUTCFullYear(),
    cells,
    documents: pack.documents.map((d) => ({ key: packDocumentKey(), ...d })),
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

/** Where the working copy has got to, as the header reports it. */
type SaveState = "clean" | "typing" | "saving" | "saved" | "failed";

/** How long after the last keystroke the working copy is written down. */
const AUTOSAVE_DELAY = 800;

/**
 * Keeps the working copy written down while somebody types.
 *
 * Two things are being held apart here. Keystrokes are coalesced by the timer,
 * so typing a figure is one save rather than six; and the saves themselves are
 * chained, so they land in the order they were made. Without the chain a slow
 * request could finish after a later one and put back a figure that had already
 * been corrected.
 *
 * Nothing is saved until something is typed. The draft still being the object
 * the grid opened with is what "nothing typed" means — so opening a pack,
 * reading it and closing it again leaves no half-written pack behind in the
 * list.
 *
 * A pack that had never been saved becomes one on the first save, and the id it
 * comes back with is kept here: everything after that has to be an edit of the
 * same pack, or a year of figures would arrive as twelve separate packs.
 */
function useAutosave({
  draft,
  reportId,
  onSave,
}: {
  draft: PackDraft;
  reportId: string | null;
  onSave: (reportId: string | null, draft: PackDraft) => Promise<string>;
}) {
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [savedId, setSavedId] = useState(reportId);

  const idRef = useRef(reportId);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsavedRef = useRef(false);

  // Mirrored rather than read from the closure, because a save runs from a
  // timer: by the time it fires, the draft it was scheduled for is several
  // keystrokes old and it is the current one that has to be written down.
  const latestRef = useRef(draft);
  const saveRef = useRef(onSave);
  useEffect(() => {
    latestRef.current = draft;
    saveRef.current = onSave;
  }, [draft, onSave]);

  /**
   * Saves now, and answers with the pack's id.
   *
   * Answering with the id rather than leaving it to be read from state is what
   * lets Publish work on a pack typed a moment ago: the id arrives with the
   * first save, and a component rendered before that save finished would
   * otherwise still be holding null and conclude nothing had been entered.
   */
  const flush = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!unsavedRef.current) {
      await chainRef.current;
      return idRef.current;
    }
    unsavedRef.current = false;
    setSaveState("saving");

    chainRef.current = chainRef.current.then(async () => {
      try {
        const id = await saveRef.current(idRef.current, latestRef.current);
        idRef.current = id;
        setSavedId(id);
        // Only "saved" if nothing was typed while this was in flight; saying
        // so otherwise would be describing a version of the pack that has
        // already been superseded on screen.
        setSaveState(unsavedRef.current ? "typing" : "saved");
      } catch {
        // Left unsaved on purpose, so the next keystroke or the close tries
        // again rather than the work sitting only in this browser tab.
        unsavedRef.current = true;
        setSaveState("failed");
      }
    });

    await chainRef.current;
    return idRef.current;
  }, []);

  const markEdited = useCallback(() => {
    unsavedRef.current = true;
    setSaveState("typing");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY);
  }, [flush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { saveState, savedId, flush, markEdited };
}

type GridProps = {
  title: string;
  initial: PackDraft;
  /** Null for a pack that has never been saved — the first save creates it. */
  reportId: string | null;
  /** Whether this pack already has figures the analysis is reading. */
  published: boolean;
  currency: string;
  metrics: EquityMetricDTO[];
  /** Every financial field in the registry, in the order it lists them. */
  fields: EquityMetricDTO[];
  /**
   * Every other pack on the project, resolved so a cell can say when a later
   * one has already restated it — editing a figure nobody reads any more should
   * not look like editing the figure the analysis uses.
   */
  otherPacks: MonthlySeries;
  /** Saves the working copy, answering with the pack's id. */
  onSave: (reportId: string | null, draft: PackDraft) => Promise<string>;
  onPublish: (reportId: string) => Promise<void>;
  onDiscard: (reportId: string) => Promise<void>;
  onClose: () => void;
};

/** The form itself. Reached through MonthlyFiguresDialog, which frames it. */
function MonthlyFiguresGrid({
  title,
  initial,
  reportId,
  published,
  currency,
  metrics,
  fields,
  otherPacks,
  onSave,
  onPublish,
  onDiscard,
  onClose,
}: GridProps) {
  const [draft, setDraft] = useState<PackDraft>(initial);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const uploading = uploadPct !== null;

  const { saveState, savedId, flush, markEdited } = useAutosave({
    draft,
    reportId,
    onSave,
  });

  /**
   * Every change to the pack goes through here rather than through setDraft, so
   * that nothing can be typed without also being queued to be saved. A pack
   * with no Save button has no second chance to catch an edit that skipped the
   * autosave.
   */
  const edit = useCallback(
    (next: (d: PackDraft) => PackDraft) => {
      setDraft(next);
      markEdited();
    },
    [markEdited],
  );

  const months = useMemo(() => monthKeysOfYear(draft.year), [draft.year]);
  const registry = useMemo(
    () => new Map<string, MetricDef>(metrics.map((m) => [m.id, m])),
    [metrics],
  );

  function set<K extends keyof PackDraft>(key: K, value: PackDraft[K]) {
    edit((d) => ({ ...d, [key]: value }));
  }

  function setCell(metricId: string, month: MonthKey, raw: string) {
    edit((d) => ({ ...d, cells: { ...d.cells, [cellKey(metricId, month)]: raw } }));
  }

  async function uploadDocuments(files: File[]) {
    if (files.length === 0) return;
    setUploadPct(0);
    try {
      // One at a time so the counter means something; a failure stops the batch
      // where it happened rather than losing the files already through.
      for (const file of files) {
        const uploaded = await uploadFileToR2(file, setUploadPct);
        edit((d) => ({
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
      for (const metric of fields) {
        resolved.set(metric.id, resolveNumber(metric.id, registry, stored, memo));
      }
      byMonth.set(month, resolved);
    }
    return byMonth;
  }, [months, fields, draft.cells, registry]);

  const filledMonths = draftMonths(draft);

  const validReportedOn = /^\d{4}-\d{2}$/.test(draft.reportedOn);

  // The only two things that stop a pack being published. A pack with no date
  // can't be ordered against the others, and a pack stating no month isn't a
  // report of anything. A pack that arrived with a line blank is otherwise
  // filed as it arrived — there is no field it must fill in, because there may
  // be nobody left to ask.
  const blocked = !validReportedOn
    ? "Set the date this report was received"
    : filledMonths.length === 0
      ? "Fill in at least one month"
      : null;

  /** Everything typed is saved before the pack leaves the screen. */
  async function close() {
    setBusy(true);
    await flush();
    onClose();
  }

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      // The published figures are read from the saved working copy, not from
      // this component, so what is on screen has to be written down first.
      const id = await flush();
      if (!id) {
        throw new Error(
          "Couldn't save these figures, so there's nothing to publish yet — check your connection and try again",
        );
      }
      await onPublish(id);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Failed to publish");
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      if (savedId) await onDiscard(savedId);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Failed to discard");
      setBusy(false);
    }
  }

  // A column at least as tall as the panel it scrolls in, so the footer below
  // can be pushed to the bottom of the screen on a project reporting three
  // fields and stick to it on one reporting thirty.
  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Stuck to the top of the same scrolling panel as the footer, so the
          pack's name, whether it counts yet, and the way out all stay on screen
          while a year of figures scrolls past underneath. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-0 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => void close()}
          disabled={busy}
          className="flex shrink-0 items-center gap-xs text-s text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
          Close
        </button>
        <span className="text-border">|</span>
        <span className="truncate text-s font-semibold text-foreground">{title}</span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs",
            published
              ? "border-success/30 bg-success/10 text-success"
              : "border-orange/30 bg-orange/10 text-orange",
          )}
        >
          {published ? "Published" : "Draft"}
        </span>
        {!published && (
          // Hidden on a narrow screen, where the title and badge are already
          // all the header has room for.
          <span className="hidden truncate text-xs text-muted-foreground lg:block">
            These figures don&apos;t count anywhere until you publish them.
          </span>
        )}
      </div>

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
                {fields.map((metric) => {
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
                        <span className="truncate text-foreground">{metric.name}</span>
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

          <p className="text-xs text-muted-foreground">
            Amounts in {currency} unless the field says otherwise. A blank month is a month
            nobody reported, which is not the same as a month of zero — enter 0 if that&apos;s
            the figure.
          </p>
        </div>
      )}

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
                  edit((d) => ({
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
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="me-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <SaveIndicator state={saveState} />
          <span
            className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
          >
            {error ?? blocked ?? ""}
          </span>
        </div>

        {/* Only offered once there is something to throw away. Discarding is
            how you get out of an edit to a published pack you didn't mean to
            start, and how a draft nobody wants leaves the list. */}
        {savedId && (
          <button
            type="button"
            onClick={() => void discard()}
            disabled={busy}
            className="h-9 rounded-lg px-3 text-s text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
          >
            {published ? "Discard changes" : "Delete draft"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void close()}
          disabled={busy}
          className="h-9 rounded-lg px-3 text-s text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          Save and close
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy || uploading || blocked != null}
          className="h-9 rounded-lg bg-primary px-3 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {published ? "Publish changes" : "Publish"}
        </button>
      </div>
    </div>
  );
}

/**
 * What the working copy is doing, in the dialog's header.
 *
 * Worth saying out loud rather than leaving to be assumed. Somebody entering a
 * year of figures into a form with no Save button needs to be told the work is
 * safe, and told plainly when it isn't.
 */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "clean") return null;

  const label =
    state === "typing"
      ? "Unsaved…"
      : state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Draft saved"
          : "Couldn't save — check your connection";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-xs text-xs",
        state === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "failed" ? (
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
      ) : state === "saved" ? (
        <Check className="h-3.5 w-3.5 text-success" strokeWidth={2} />
      ) : (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      )}
      {label}
    </span>
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
export function MonthlyFiguresDialog(props: GridProps) {
  useScrollLock(true);

  if (typeof document === "undefined") return null;

  // Portalled to the body, so the card's own stacking and overflow can't clip a
  // panel that is meant to cover the page.
  return createPortal(
    <div data-scroll-lock-root className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* The container the grid's @md/card: rules measure against, which inside
          the card was the card itself. Also the scroller the grid's own header
          and footer stick to. */}
      <div className="app-card flex-1 overflow-y-auto p-4">
        <MonthlyFiguresGrid {...props} />
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
        // A corner dot rather than a colour on the text, so it still reads on
        // twelve narrow cells.
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
