"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, ChevronRight, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** The pitch's own accent, which the charts inside these frames are drawn in. */
const ACCENT = "#ff3366";

/**
 * The rows a chart was drawn from, in the order the chart reads them.
 * Anything already formatted for display — "20%", "1 Aug 2026" — rather than
 * raw, since this table is read rather than recomputed.
 */
export type ChartData = {
  columns: string[];
  rows: ReactNode[][];
};

/**
 * An earlier version of the same table. A chart draws where things stand now,
 * but the entries behind it are kept, so the data view can go back through them
 * one dated version at a time.
 */
export type ChartHistory = {
  /** How this version is picked out — usually the date it took effect. */
  label: string;
  note?: string;
  source?: string;
  data: ChartData;
};

/**
 * A chart with its workings attached.
 *
 * Every drawn figure on the pitch sits in one of these, and every one of them
 * can be flipped to the table behind it: the numbers that went in, how they
 * were worked out, and which part of the portfolio they were read from. Where
 * the chart shows only the latest of several entries, the earlier ones are
 * there too, behind their own dates. A chart nobody can check is a claim, and
 * this deck is shown to people who will ask.
 */
export function ChartFrame({
  title,
  note,
  source,
  data,
  history,
  aside,
  children,
  className,
}: {
  title: string;
  /** How the figures were arrived at, shown with the table. */
  note: string;
  /** Where they came from — the section, and the date they were entered for. */
  source: string;
  data: ChartData;
  /** Earlier versions of the same table, newest first. */
  history?: ChartHistory[];
  /**
   * Something small the chart wants said beside its title — where you are in a
   * panel that scrolls, say. Put away with the chart when the table is up,
   * since it describes the drawing rather than the figures.
   */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showData, setShowData] = useState(false);
  // Which version is being read: -1 is what the chart draws, anything else is
  // an index into the entries kept behind it.
  const [version, setVersion] = useState(-1);

  const past = history ?? [];
  const shown = version >= 0 ? past[version] : null;
  const table = shown?.data ?? data;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/20 p-5 transition-colors hover:border-muted-foreground/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-10">
        <h3 className="text-s font-semibold text-foreground m-0">
          {title}
        </h3>
        {!showData && aside}
      </div>

      {showData ? (
        <div>
          {past.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto mb-4">
              <VersionTab
                on={version === -1}
                onClick={() => setVersion(-1)}
                label="Current"
              />
              {past.map((entry, i) => (
                <VersionTab
                  key={entry.label + i}
                  on={version === i}
                  onClick={() => setVersion(i)}
                  label={entry.label}
                />
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {shown?.note ?? note}
          </p>

          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-s">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {table.columns.map((column, i) => (
                    <th
                      key={column}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground border-b border-border whitespace-nowrap",
                        i === 0 ? "text-start" : "text-end",
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-border/50 last:border-0">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          "px-2.5 py-1.5 tabular-nums",
                          c === 0
                            ? "text-start text-foreground"
                            : "text-end text-muted-foreground",
                        )}
                      >
                        {cell ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={table.columns.length}
                      className="px-2.5 py-3 text-center text-muted-foreground"
                    >
                      Nothing recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        children
      )}

      <div className="flex items-center gap-3 mt-10 pt-6 border-t border-border/60">
        <button
          type="button"
          onClick={() => setShowData((v) => !v)}
          aria-pressed={showData}
          className="flex items-center gap-2.5 ps-3 pe-2.5 h-9 rounded-xl border border-border bg-card/40 text-s font-semibold text-foreground hover:border-muted-foreground/40 hover:bg-muted/40 transition-colors shrink-0"
        >
          {showData ? (
            <BarChart3
              className="w-4 h-4 shrink-0"
              style={{ color: ACCENT }}
              strokeWidth={1.75}
            />
          ) : (
            <Table2
              className="w-4 h-4 shrink-0"
              style={{ color: ACCENT }}
              strokeWidth={1.75}
            />
          )}
          {showData ? "View chart" : "View data"}
          {!showData && past.length > 0 && (
            <span className="font-normal text-muted-foreground">
              {past.length + 1}
            </span>
          )}
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
              showData && "rotate-90",
            )}
            strokeWidth={1.75}
          />
        </button>
        <span className="text-xs text-muted-foreground/70 truncate">
          {(showData && shown?.source) || source}
        </span>
      </div>
    </div>
  );
}

function VersionTab({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "px-2 h-6 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0",
        on
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}
