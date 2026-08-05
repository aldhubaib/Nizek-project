"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coins,
  Megaphone,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countryLabel,
  countryName,
  isCountryCode,
  sortedCountries,
} from "@/lib/countries";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import {
  saveEquityPitchSection,
  type EquityPortfolioDTO,
  type OpportunityItemInput,
} from "@/actions/equity";

/**
 * The repeating sections of the pitch, each of them a module of its own.
 *
 * They differ only in which columns a row carries, so one editor is described
 * by data and reused: a section is an entry in PITCH_SECTIONS rather than
 * another form. Competitive advantage is the exception to the module part —
 * it's rendered inside Opportunity, using the same pieces.
 */

export type PitchItem = NonNullable<
  EquityPortfolioDTO["opportunity"]
>["items"][number];

export const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

export const textareaCls =
  "w-full px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y";

export const readCellCls =
  "min-h-9 px-3 py-2 rounded-lg border border-border bg-muted/30 flex items-center text-[13px] text-foreground";

const labelCls =
  "block text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

/** The columns a row carries. Which ones a section uses is its own business. */
type FieldKey =
  | "heading"
  | "figure"
  | "caption"
  | "body"
  | "countries"
  | "axisX"
  | "axisY"
  | "isUs"
  | "share";

type FieldSpec = {
  key: FieldKey;
  label: string;
  placeholder?: string;
  kind: "text" | "textarea" | "axis" | "flag" | "countries" | "percent";
};

export type SectionSpec = {
  id: string;
  title: string;
  description: string;
  /** Matches the field list, plus a trailing column for the remove button. */
  grid: string;
  fields: FieldSpec[];
  addLabel: string;
  emptyLabel: string;
  /** What one row is called, for the summary line on the card. */
  noun: [one: string, many: string];
  /**
   * Set where the report draws the rows as a split of one whole. The shares
   * then have to come to 100 before it will save, since a chart of parts that
   * don't add up is a chart of something else.
   */
  sharesTotal?: boolean;
};

export const PITCH_SECTIONS: Record<string, SectionSpec> = {
  MARKET_VALIDATION: {
    id: "MARKET_VALIDATION",
    title: "Market validation",
    description: "Proof the demand is already there, and where you measured it.",
    grid:
      "sm:grid-cols-[minmax(0,1fr)_7rem_9rem_minmax(0,1.1fr)_minmax(0,1fr)_1.75rem]",
    fields: [
      { key: "heading", label: "Source", placeholder: "couchsurfing.com", kind: "text" },
      { key: "figure", label: "Figure", placeholder: "670,000", kind: "text" },
      { key: "caption", label: "What it counts", placeholder: "Total users", kind: "text" },
      { key: "countries", label: "Countries", kind: "countries" },
      { key: "body", label: "Note", placeholder: "Measured 7/9 to 7/16", kind: "text" },
    ],
    addLabel: "Add a source",
    emptyLabel: "No validation figures yet.",
    noun: ["source", "sources"],
  },
  BUSINESS_MODEL: {
    id: "BUSINESS_MODEL",
    title: "Business model",
    description: "How the money is made, a line at a time.",
    grid: "sm:grid-cols-[10rem_minmax(0,1fr)_1.75rem]",
    fields: [
      { key: "figure", label: "Figure", placeholder: "$25", kind: "text" },
      {
        key: "body",
        label: "Line",
        placeholder: "Average fee — $80/night for 3 nights",
        kind: "text",
      },
    ],
    addLabel: "Add a line",
    emptyLabel: "Nothing on the business model yet.",
    noun: ["line", "lines"],
  },
  MARKET_ADOPTION: {
    id: "MARKET_ADOPTION",
    title: "Market adoption",
    description:
      "How the first users are reached, and how much of the reach each channel carries. The report draws them as a split, so the shares have to come to 100%.",
    grid: "sm:grid-cols-[12rem_6rem_minmax(0,1fr)_1.75rem]",
    fields: [
      { key: "heading", label: "Channel", placeholder: "Events", kind: "text" },
      { key: "share", label: "Share %", placeholder: "25", kind: "percent" },
      {
        key: "body",
        label: "How we reach it",
        placeholder: "Target events monthly — Octoberfest (6M)",
        kind: "textarea",
      },
    ],
    addLabel: "Add a channel",
    emptyLabel: "No channels yet.",
    noun: ["channel", "channels"],
    sharesTotal: true,
  },
  COMPETITION: {
    id: "COMPETITION",
    title: "Competition",
    description:
      "Who else is in the market, and where they sit. Each axis runs -100 to 100: offline to online, and expensive to affordable.",
    grid: "sm:grid-cols-[minmax(0,1fr)_7rem_7rem_5rem_1.75rem]",
    fields: [
      { key: "heading", label: "Who", placeholder: "Craigslist", kind: "text" },
      { key: "axisX", label: "Offline → online", kind: "axis" },
      { key: "axisY", label: "Costly → cheap", kind: "axis" },
      { key: "isUs", label: "That's us", kind: "flag" },
    ],
    addLabel: "Add a competitor",
    emptyLabel: "No competitors mapped yet.",
    noun: ["competitor", "competitors"],
  },
  ADVANTAGE: {
    id: "ADVANTAGE",
    title: "Competitive advantage",
    description: "What the competition can't easily copy.",
    grid: "sm:grid-cols-[12rem_minmax(0,1fr)_1.75rem]",
    fields: [
      { key: "heading", label: "The edge", placeholder: "First to market", kind: "text" },
      {
        key: "body",
        label: "Why it holds",
        placeholder: "for transaction-based temporary housing",
        kind: "text",
      },
    ],
    addLabel: "Add an advantage",
    emptyLabel: "No advantages listed yet.",
    noun: ["advantage", "advantages"],
  },
};

/** The icon each module wears, matching the one the report gives it. */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  MARKET_VALIDATION: CheckCircle2,
  BUSINESS_MODEL: Coins,
  MARKET_ADOPTION: Megaphone,
  COMPETITION: Target,
};

/**
 * Countries as removable chips over an autocompleting box. A datalist is doing
 * the searching, so the whole world is available without a combobox to build,
 * and only names on the list can be committed.
 */
function CountryPicker({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const all = useMemo(() => sortedCountries(), []);

  function commit(text: string) {
    const typed = text.trim();
    if (!typed) return;
    const match = all.find(
      (c) =>
        c.name.toLowerCase() === typed.toLowerCase() ||
        c.code === typed.toUpperCase(),
    );
    const code = match?.code ?? (isCountryCode(typed) ? typed.toUpperCase() : null);
    if (!code) return;
    if (!codes.includes(code)) onChange([...codes, code]);
    setDraft("");
  }

  return (
    <div className="rounded-lg border border-border bg-card px-1.5 py-1.5 min-h-9 flex flex-wrap items-center gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className="flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md bg-muted text-[11px] text-foreground"
        >
          {countryLabel(code)}
          <button
            type="button"
            onClick={() => onChange(codes.filter((c) => c !== code))}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Remove ${countryName(code)}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        list={listId}
        value={draft}
        onChange={(e) => {
          // Picking from the datalist fires a change with the full name, so a
          // click commits without needing Enter as well.
          const next = e.target.value;
          if (all.some((c) => c.name === next)) commit(next);
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
          if (e.key === "Backspace" && !draft && codes.length > 0) {
            onChange(codes.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={codes.length === 0 ? "Add a country…" : ""}
        className="flex-1 min-w-20 h-6 px-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <datalist id={listId}>
        {all.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

export type ItemDraft = {
  /** Survives reordering and edits, which an index wouldn't. */
  key: string;
  heading: string;
  figure: string;
  caption: string;
  body: string;
  countries: string[];
  axisX: string;
  axisY: string;
  isUs: boolean;
  share: string;
};

let itemSeq = 0;

export function emptyItem(): ItemDraft {
  itemSeq += 1;
  return {
    key: `item-${itemSeq}`,
    heading: "",
    figure: "",
    caption: "",
    body: "",
    countries: [],
    axisX: "",
    axisY: "",
    isUs: false,
    share: "",
  };
}

export function itemToDraft(item: PitchItem): ItemDraft {
  return {
    ...emptyItem(),
    heading: item.heading ?? "",
    figure: item.figure ?? "",
    caption: item.caption ?? "",
    body: item.body ?? "",
    countries: item.countries,
    axisX: item.axisX?.toString() ?? "",
    axisY: item.axisY?.toString() ?? "",
    isUs: item.isUs,
    share: item.share?.toString() ?? "",
  };
}

function parseAxis(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function draftsToItems(
  section: string,
  drafts: ItemDraft[],
): OpportunityItemInput[] {
  return drafts.map((d) => ({
    section,
    heading: d.heading,
    figure: d.figure,
    caption: d.caption,
    body: d.body,
    countries: d.countries,
    axisX: parseAxis(d.axisX),
    axisY: parseAxis(d.axisY),
    isUs: d.isUs,
    share: parseAxis(d.share),
  }));
}

/** What the shares come to, ignoring the rows nobody has filled in yet. */
export function shareTotal(rows: ItemDraft[]) {
  return rows.reduce((sum, r) => sum + (parseAxis(r.share) ?? 0), 0);
}

/**
 * Why the section can't be saved yet, in the words of what to do about it.
 * Only sections drawn as a split have anything to say here.
 */
function blockedReason(spec: SectionSpec, rows: ItemDraft[]) {
  if (!spec.sharesTotal) return null;
  const filled = rows.filter((r) => r.heading.trim() || r.share.trim());
  if (filled.length === 0) return null;
  const missing = filled.filter((r) => !r.share.trim()).length;
  if (missing > 0) {
    return `${missing} ${missing === 1 ? "row has" : "rows have"} no share yet.`;
  }
  // Two decimals are allowed in, so thirds don't have to be talked out of.
  const total = Math.round(shareTotal(filled) * 100) / 100;
  if (Math.abs(total - 100) > 0.01) {
    return `The shares come to ${total}%, not 100%.`;
  }
  return null;
}

/** What a field holds once saved, as a line of text. */
function readValue(spec: FieldSpec, item: PitchItem): string {
  switch (spec.kind) {
    case "countries":
      return item.countries.length > 0
        ? item.countries.map(countryLabel).join(", ")
        : "—";
    case "axis":
      return (spec.key === "axisX" ? item.axisX : item.axisY)?.toString() ?? "—";
    case "percent":
      return item.share != null ? `${item.share}%` : "—";
    case "flag":
      return item.isUs ? "Us" : "—";
    default:
      return (item[spec.key as "heading" | "figure" | "caption" | "body"] ?? "—") || "—";
  }
}

/** A section that hasn't been filled in, said plainly rather than left out. */
export function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-muted-foreground px-3 py-2 rounded-lg border border-dashed border-border">
      {children}
    </p>
  );
}

/** The button that opens a module for editing, worded for what's in it. */
export function EditButton({
  filled,
  onClick,
}: {
  filled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
    >
      <Pencil className="w-3.5 h-3.5" />
      {filled ? "Edit" : "Fill in"}
    </button>
  );
}

export function FormButtons({
  busy,
  blocked,
  onCancel,
  onSave,
}: {
  busy: boolean;
  /** Why saving is off, said where the button is rather than after pressing it. */
  blocked?: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
      {blocked && (
        <span className="text-[12px] text-destructive mr-auto">{blocked}</span>
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
        onClick={onSave}
        disabled={busy || Boolean(blocked)}
        className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/** The rows of a section as saved, in the same columns the form uses. */
export function PitchRowsView({
  spec,
  rows,
}: {
  spec: SectionSpec;
  rows: PitchItem[];
}) {
  if (rows.length === 0) return <Blank>{spec.emptyLabel}</Blank>;
  return (
    <div className="space-y-2">
      <div className={cn("hidden sm:grid gap-2 px-0.5", spec.grid)}>
        {spec.fields.map((f) => (
          <span key={f.key} className={labelCls}>
            {f.label}
          </span>
        ))}
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.id} className={cn("grid gap-2 items-stretch", spec.grid)}>
          {spec.fields.map((f) => (
            <div key={f.key} className={readCellCls}>
              <span className="whitespace-pre-wrap break-words">
                {readValue(f, row)}
              </span>
            </div>
          ))}
          <span />
        </div>
      ))}
    </div>
  );
}

/** The rows of a section being edited, add and remove included. */
export function PitchRowsEditor({
  spec,
  rows,
  setRows,
}: {
  spec: SectionSpec;
  rows: ItemDraft[];
  setRows: (update: (rows: ItemDraft[]) => ItemDraft[]) => void;
}) {
  function update(key: string, patch: Partial<ItemDraft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function field(spec: FieldSpec, row: ItemDraft) {
    switch (spec.kind) {
      case "countries":
        return (
          <CountryPicker
            codes={row.countries}
            onChange={(countries) => update(row.key, { countries })}
          />
        );
      case "axis":
        return (
          <input
            type="number"
            min={-100}
            max={100}
            value={spec.key === "axisX" ? row.axisX : row.axisY}
            onChange={(e) =>
              update(row.key, { [spec.key]: e.target.value } as Partial<ItemDraft>)
            }
            placeholder="0"
            className={cn(inputCls, "tabular-nums")}
          />
        );
      case "percent":
        return (
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={row.share}
            onChange={(e) => update(row.key, { share: e.target.value })}
            placeholder={spec.placeholder}
            className={cn(inputCls, "tabular-nums")}
          />
        );
      case "flag":
        return (
          <label className="h-9 flex items-center justify-center">
            <input
              type="checkbox"
              checked={row.isUs}
              onChange={(e) => update(row.key, { isUs: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
          </label>
        );
      case "textarea":
        return (
          <textarea
            value={row[spec.key as "body" | "caption"]}
            onChange={(e) =>
              update(row.key, { [spec.key]: e.target.value } as Partial<ItemDraft>)
            }
            rows={2}
            placeholder={spec.placeholder}
            className={textareaCls}
          />
        );
      default:
        return (
          <input
            type="text"
            value={row[spec.key as "heading" | "figure" | "caption" | "body"]}
            onChange={(e) =>
              update(row.key, { [spec.key]: e.target.value } as Partial<ItemDraft>)
            }
            placeholder={spec.placeholder}
            className={inputCls}
          />
        );
    }
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className={cn("hidden sm:grid gap-2 px-0.5", spec.grid)}>
          {spec.fields.map((f) => (
            <span key={f.key} className={labelCls}>
              {f.label}
            </span>
          ))}
          <span />
        </div>
      )}

      {rows.map((row) => (
        <div key={row.key} className={cn("grid gap-2 items-start", spec.grid)}>
          {spec.fields.map((f) => (
            <div key={f.key}>{field(f, row)}</div>
          ))}
          <button
            type="button"
            onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
            title="Remove row"
            className="w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, emptyItem()])}
        className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
      >
        <Plus className="w-3 h-3" />
        {spec.addLabel}
      </button>
    </div>
  );
}

/**
 * One repeating section as a module of its own: what it holds, and an editor
 * that saves nothing but its own rows.
 */
export function PitchSectionCard({
  portfolioId,
  section,
  items,
}: {
  portfolioId: string;
  section: string;
  /** Every pitch item on the portfolio; this card takes only its own. */
  items: PitchItem[];
}) {
  const router = useRouter();
  const spec = PITCH_SECTIONS[section];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = items.filter((i) => i.section === section);
  const [one, many] = spec.noun;

  return (
    <CollapsibleCard
      icon={SECTION_ICONS[section]}
      title={spec.title}
      summary={
        rows.length > 0
          ? `${rows.length} ${rows.length === 1 ? one : many}`
          : "Nothing here yet"
      }
      description={spec.description}
      forceOpen={editing}
      actions={
        !editing && (
          <EditButton filled={rows.length > 0} onClick={() => setEditing(true)} />
        )
      }
    >
      {editing ? (
        <PitchSectionForm
          portfolioId={portfolioId}
          spec={spec}
          rows={rows}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <PitchRowsView spec={spec} rows={rows} />
      )}
    </CollapsibleCard>
  );
}

function PitchSectionForm({
  portfolioId,
  spec,
  rows: saved,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  spec: SectionSpec;
  rows: PitchItem[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ItemDraft[]>(() =>
    saved.length > 0 ? saved.map(itemToDraft) : [emptyItem()],
  );

  async function save() {
    setBusy(true);
    try {
      await saveEquityPitchSection(
        portfolioId,
        spec.id,
        draftsToItems(spec.id, rows),
      );
      onDone();
    } catch (err) {
      alert((err as Error).message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PitchRowsEditor spec={spec} rows={rows} setRows={setRows} />
      {spec.sharesTotal && <ShareTally rows={rows} />}
      <FormButtons
        busy={busy}
        blocked={blockedReason(spec, rows)}
        onCancel={onCancel}
        onSave={save}
      />
    </div>
  );
}

/** What the shares add up to as they're typed, so 100 isn't a guessing game. */
function ShareTally({ rows }: { rows: ItemDraft[] }) {
  const total = Math.round(shareTotal(rows) * 100) / 100;
  const done = Math.abs(total - 100) <= 0.01;
  return (
    <p className="text-[12px] tabular-nums">
      <span className="text-muted-foreground">Shares total </span>
      <span className={done ? "text-foreground" : "text-destructive"}>
        {total}%
      </span>
      {!done && (
        <span className="text-muted-foreground">
          {" "}
          — {Math.round((100 - total) * 100) / 100}% to place
        </span>
      )}
    </p>
  );
}
