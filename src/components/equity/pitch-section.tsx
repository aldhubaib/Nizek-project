"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coins,
  Megaphone,
  Pencil,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddButton } from "@/components/add-button";
import {
  countryLabel,
  countryName,
  isCountryCode,
  sortedCountries,
} from "@/lib/countries";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { GrowingTextarea } from "@/components/equity/growing-textarea";
import { MARKET_CURRENCIES, MARKET_UNITS } from "@/lib/market-size";
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
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

export const textareaCls =
  "w-full px-3 py-2 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y";

export const readCellCls =
  "min-h-9 px-3 py-2 rounded-lg border border-border bg-muted/30 flex items-center text-s text-foreground";

const labelCls =
  "block text-xs font-medium text-muted-foreground uppercase tracking-wide";

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
  | "share"
  | "value"
  | "unit"
  | "currency";

type FieldSpec = {
  key: FieldKey;
  label: string;
  placeholder?: string;
  kind:
    | "text"
    | "textarea"
    | "axis"
    | "flag"
    | "countries"
    | "percent"
    | "number"
    | "unit"
    | "currency";
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
      "@md/card:grid-cols-[minmax(0,1fr)_7rem_9rem_minmax(0,1.1fr)_minmax(0,1fr)_1.75rem]",
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
    description:
      "How the money is made, a line at a time. The scale is picked rather than typed, so a fee and a run rate can be told apart.",
    grid: "@md/card:grid-cols-[minmax(0,1fr)_9rem_9rem_7rem_1.75rem]",
    fields: [
      {
        key: "heading",
        label: "Title",
        placeholder: "Subscription fees",
        kind: "text",
      },
      { key: "value", label: "Number", placeholder: "25", kind: "number" },
      { key: "unit", label: "Unit", kind: "unit" },
      { key: "currency", label: "Currency", kind: "currency" },
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
    grid: "@md/card:grid-cols-[12rem_6rem_minmax(0,1fr)_1.75rem]",
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
      "Who else is in the market, scored 0–10 against the anchors the market is fought on. The report draws everyone on one radar, each anchor a corner.",
    grid: "@md/card:grid-cols-[minmax(0,1fr)_7rem_7rem_5rem_1.75rem]",
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
    grid: "@md/card:grid-cols-[12rem_minmax(0,1fr)_1.75rem]",
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
          className="flex items-center gap-1 ps-1.5 pe-1 py-0.5 rounded-md bg-muted text-xs text-foreground"
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
        className="flex-1 min-w-20 h-6 px-1 bg-transparent text-s text-foreground placeholder:text-muted-foreground focus:outline-none"
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
  value: string;
  unit: string;
  currency: string;
};

let itemSeq = 0;

/** A new row, on the portfolio's own currency where it's going to carry one. */
export function emptyItem(currency = ""): ItemDraft {
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
    value: "",
    unit: "",
    currency,
  };
}

export function itemToDraft(item: PitchItem): ItemDraft {
  return {
    ...emptyItem(item.currency ?? ""),
    heading: item.heading ?? "",
    figure: item.figure ?? "",
    caption: item.caption ?? "",
    body: item.body ?? "",
    countries: item.countries,
    axisX: item.axisX?.toString() ?? "",
    axisY: item.axisY?.toString() ?? "",
    isUs: item.isUs,
    share: item.share?.toString() ?? "",
    value: item.value?.toString() ?? "",
    unit: item.unit ?? "",
  };
}

/** A typed figure, or nothing where the box is empty or unreadable. */
function parseNumber(raw: string): number | null {
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
    axisX: parseNumber(d.axisX),
    axisY: parseNumber(d.axisY),
    isUs: d.isUs,
    share: parseNumber(d.share),
    value: parseNumber(d.value.replace(/,/g, "")),
    unit: d.unit,
    currency: d.currency,
  }));
}

/** What the shares come to, ignoring the rows nobody has filled in yet. */
export function shareTotal(rows: ItemDraft[]) {
  return rows.reduce((sum, r) => sum + (parseNumber(r.share) ?? 0), 0);
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
    case "number":
      return item.value != null ? item.value.toLocaleString("en-US") : "—";
    case "unit":
      return MARKET_UNITS.find((u) => u.key === item.unit)?.label ?? "—";
    case "currency":
      return item.currency || "—";
    case "flag":
      return item.isUs ? "Us" : "—";
    default:
      return (item[spec.key as "heading" | "figure" | "caption" | "body"] ?? "—") || "—";
  }
}

/** A section that hasn't been filled in, said plainly rather than left out. */
export function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-s text-muted-foreground px-3 py-2 rounded-lg border border-dashed border-border">
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
      className="flex items-center gap-xs px-3 py-1.5 rounded-lg border border-border text-s font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
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
        <span className="text-s text-destructive me-auto">{blocked}</span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="px-3 h-9 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || Boolean(blocked)}
        className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-s font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
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
      <div className={cn("@max-md/card:hidden @md/card:grid gap-2 px-0.5", spec.grid)}>
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
  currency = "",
}: {
  spec: SectionSpec;
  rows: ItemDraft[];
  setRows: (update: (rows: ItemDraft[]) => ItemDraft[]) => void;
  /** What a row carrying money starts on, where the section has one. */
  currency?: string;
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
      case "number":
        return (
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={row.value}
            onChange={(e) => update(row.key, { value: e.target.value })}
            placeholder={spec.placeholder}
            className={cn(inputCls, "tabular-nums")}
          />
        );
      case "unit":
        return (
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
        );
      case "currency":
        return (
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
          <GrowingTextarea
            value={row[spec.key as "body" | "caption"]}
            onChange={(value) =>
              update(row.key, { [spec.key]: value } as Partial<ItemDraft>)
            }
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
        <div className={cn("@max-md/card:hidden @md/card:grid gap-2 px-0.5", spec.grid)}>
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

      <AddButton
        label={spec.addLabel}
        onClick={() => setRows((rs) => [...rs, emptyItem(currency)])}
      />
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
  currency = "",
  anchors = [],
  usLabel = "Us",
}: {
  portfolioId: string;
  section: string;
  /** Every pitch item on the portfolio; this card takes only its own. */
  items: PitchItem[];
  /** What the portfolio is priced in, for the sections that carry amounts. */
  currency?: string;
  /** The radar's corners, which only the competition module carries. */
  anchors?: string[];
  /** What the competition's fixed first row is called — the project's name. */
  usLabel?: string;
}) {
  const router = useRouter();
  const spec = PITCH_SECTIONS[section];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = items.filter((i) => i.section === section);
  const [one, many] = spec.noun;
  const competition = section === "COMPETITION";

  function done() {
    setEditing(false);
    router.refresh();
  }

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
        competition ? (
          <CompetitionForm
            portfolioId={portfolioId}
            savedAnchors={anchors}
            saved={rows}
            usLabel={usLabel}
            busy={busy}
            setBusy={setBusy}
            onDone={done}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <PitchSectionForm
            portfolioId={portfolioId}
            spec={spec}
            rows={rows}
            currency={currency}
            busy={busy}
            setBusy={setBusy}
            onDone={done}
            onCancel={() => setEditing(false)}
          />
        )
      ) : competition && anchors.length > 0 ? (
        <CompetitionMatrixView anchors={anchors} rows={rows} />
      ) : (
        // Competition entered before anchors existed still reads in its old
        // quadrant columns, until it's edited and scored.
        <PitchRowsView spec={spec} rows={rows} />
      )}
    </CollapsibleCard>
  );
}

function PitchSectionForm({
  portfolioId,
  spec,
  rows: saved,
  currency,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  spec: SectionSpec;
  rows: PitchItem[];
  currency: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ItemDraft[]>(() =>
    saved.length > 0 ? saved.map(itemToDraft) : [emptyItem(currency)],
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
      <PitchRowsEditor
        spec={spec}
        rows={rows}
        setRows={setRows}
        currency={currency}
      />
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

// ─── Competition: anchors and scores ────────────────────
// The competition module outgrew the generic columns: its rows are scored
// against anchors the portfolio itself defines, so the editor is a matrix
// whose columns are data. Everything else about it — replace-wholesale saves,
// the card, the buttons — is shared with the other sections.

/** What a new portfolio starts scoring on, until its own anchors are named. */
export const DEFAULT_ANCHORS = [
  "Product",
  "Price",
  "Sales",
  "Marketing",
  "Support",
];

/** Under 3 anchors there's no shape to draw; over 6, no room to read it. */
const ANCHORS_MIN = 3;
const ANCHORS_MAX = 6;

type AnchorDraft = { key: string; name: string };

type CompetitorDraft = {
  key: string;
  heading: string;
  /** The portfolio's own row: first, named for the company, not removable. */
  isUs: boolean;
  /** Keyed by the anchor draft's key, so renaming an anchor keeps its scores. */
  scores: Record<string, string>;
  /** The old quadrant placement, carried through a save unseen so it's kept. */
  axisX: number | null;
  axisY: number | null;
};

let anchorSeq = 0;
function anchorDraft(name = ""): AnchorDraft {
  anchorSeq += 1;
  return { key: `anchor-${anchorSeq}`, name };
}

let competitorSeq = 0;
function emptyCompetitor(): CompetitorDraft {
  competitorSeq += 1;
  return {
    key: `competitor-${competitorSeq}`,
    heading: "",
    isUs: false,
    scores: {},
    axisX: null,
    axisY: null,
  };
}

/**
 * The saved anchors and rows as drafts, scores re-keyed to the anchor drafts.
 * The first row is always the portfolio's own company under its project name —
 * the whole section exists to compare against us, so us isn't optional — and
 * whatever row was marked as ours before carries its scores into it.
 */
function competitionDrafts(
  savedAnchors: string[],
  saved: PitchItem[],
  usLabel: string,
) {
  const anchors = (savedAnchors.length > 0 ? savedAnchors : DEFAULT_ANCHORS).map(
    (name) => anchorDraft(name),
  );
  const draftOf = (item: PitchItem | undefined): CompetitorDraft => ({
    ...emptyCompetitor(),
    heading: item?.heading ?? "",
    axisX: item?.axisX ?? null,
    axisY: item?.axisY ?? null,
    scores: Object.fromEntries(
      anchors.map((a) => [a.key, item?.scores?.[a.name]?.toString() ?? ""]),
    ),
  });
  const others = saved.filter((item) => !item.isUs);
  const rows = [
    { ...draftOf(saved.find((item) => item.isUs)), heading: usLabel, isUs: true },
    ...(others.length > 0 ? others.map(draftOf) : [emptyCompetitor()]),
  ];
  return { anchors, rows };
}

/** A typed score that isn't a number from 0 to 10. An empty box isn't wrong —
 * missing is its own complaint — but 11 or -1 is. */
function scoreInvalid(raw: string) {
  if (!raw.trim()) return false;
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 || n > 10;
}

/** A row that counts: ours always, anyone else once named or scored at all. */
function activeRow(row: CompetitorDraft) {
  return (
    row.isUs ||
    row.heading.trim() !== "" ||
    Object.values(row.scores).some((s) => s.trim())
  );
}

/** Whether anything has been entered at all. Our own row is always there, so
 * only a named competitor or a typed score counts as the section being
 * filled in — an untouched form is allowed to close quietly. */
function competitionFilled(rows: CompetitorDraft[]) {
  return rows.some(
    (r) =>
      (!r.isUs && r.heading.trim()) ||
      Object.values(r.scores).some((s) => s.trim()),
  );
}

/** Why the competition can't be saved yet, said before the button is pressed. */
function competitionBlocked(anchors: AnchorDraft[], rows: CompetitorDraft[]) {
  if (!competitionFilled(rows)) return null;
  const names = anchors.map((a) => a.name.trim()).filter(Boolean);
  if (names.length < ANCHORS_MIN) {
    return `A radar needs at least ${ANCHORS_MIN} anchors.`;
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return "Two anchors share a name.";
  }
  if (rows.some((r) => Object.values(r.scores).some(scoreInvalid))) {
    return "Scores run 0 to 10.";
  }
  const active = rows.filter(activeRow);
  if (active.some((r) => !r.isUs && !r.heading.trim())) {
    return "Every competitor needs a name.";
  }
  const anchorKeys = anchors.filter((a) => a.name.trim()).map((a) => a.key);
  if (
    active.some((r) => anchorKeys.some((k) => !(r.scores[k] ?? "").trim()))
  ) {
    return "Every row needs a score on every anchor.";
  }
  return null;
}

/** The columns of the matrix: who, a score per anchor, and the trailing
 * controls. Wide enough for the anchor's name, since the header is where the
 * anchors are edited. */
function competitionGrid(anchorCount: number, trailing: string) {
  return {
    gridTemplateColumns: `minmax(0,1fr) repeat(${anchorCount}, minmax(0,6.5rem))${trailing}`,
  };
}

function CompetitionForm({
  portfolioId,
  savedAnchors,
  saved,
  usLabel,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  savedAnchors: string[];
  saved: PitchItem[];
  /** What the first, fixed row is called — the portfolio's project name. */
  usLabel: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [initial] = useState(() =>
    competitionDrafts(savedAnchors, saved, usLabel),
  );
  const [anchors, setAnchors] = useState(initial.anchors);
  const [rows, setRows] = useState(initial.rows);

  function updateRow(key: string, patch: Partial<CompetitorDraft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    try {
      const named = anchors
        .map((a) => ({ key: a.key, name: a.name.trim() }))
        .filter((a) => a.name);
      await saveEquityPitchSection(
        portfolioId,
        "COMPETITION",
        rows.map((r) => ({
          section: "COMPETITION",
          heading: r.heading,
          isUs: r.isUs,
          axisX: r.axisX,
          axisY: r.axisY,
          scores: Object.fromEntries(
            named.map((a) => [a.name, parseNumber(r.scores[a.key] ?? "")]),
          ),
        })),
        named.map((a) => a.name),
      );
      onDone();
    } catch (err) {
      alert((err as Error).message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const grid = competitionGrid(anchors.length, " 1.75rem");
  // The missing-score red only lights once something has been entered — an
  // untouched form isn't wrong yet, it's just empty.
  const filled = competitionFilled(rows);

  return (
    <div className="space-y-4">
      <div className="space-y-2 overflow-x-auto">
        {/*
          The anchors are the header: what everyone is scored on is edited
          where it's read, one row for both, with the last cell adding a
          column the way the button under the rows adds a row.
        */}
        <div className="grid gap-2 px-0.5 items-center" style={grid}>
          <span className={labelCls}>Who</span>
          {anchors.map((a) => (
            <div key={a.key} className="relative">
              <input
                value={a.name}
                onChange={(e) =>
                  setAnchors((as) =>
                    as.map((x) =>
                      x.key === a.key ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Anchor"
                className={cn(
                  inputCls,
                  "h-8 px-2 pe-6 text-xs font-medium uppercase tracking-wide",
                )}
              />
              <button
                type="button"
                onClick={() =>
                  setAnchors((as) => as.filter((x) => x.key !== a.key))
                }
                title="Remove anchor"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          {anchors.length < ANCHORS_MAX ? (
            <AddButton
              label="Add an anchor"
              onClick={() => setAnchors((as) => [...as, anchorDraft()])}
            />
          ) : (
            <span />
          )}
        </div>

        {rows.map((row) => (
          <div key={row.key} className="grid gap-2 items-start" style={grid}>
            {row.isUs ? (
              // Us, under the project's own name: the row the rest are read
              // against, so it can't be renamed or removed.
              <div
                className={cn(
                  readCellCls,
                  "bg-muted/30 text-foreground font-medium",
                )}
              >
                <span className="truncate">{row.heading}</span>
              </div>
            ) : (
              <input
                type="text"
                value={row.heading}
                onChange={(e) => updateRow(row.key, { heading: e.target.value })}
                placeholder="Competitor"
                className={cn(
                  inputCls,
                  // Scored but nameless: the row is in the chart with nothing
                  // to call it, so the empty name is the box in the wrong.
                  filled &&
                    activeRow(row) &&
                    !row.heading.trim() &&
                    "border-destructive focus:ring-destructive/40",
                )}
              />
            )}
            {anchors.map((a) => {
              const raw = row.scores[a.key] ?? "";
              // Out of 0–10, or left empty on a row that's in play — both
              // hold the save, so both are shown where the problem is.
              const wrong =
                scoreInvalid(raw) ||
                (filled &&
                  activeRow(row) &&
                  a.name.trim() !== "" &&
                  !raw.trim());
              return (
                <input
                  key={a.key}
                  type="number"
                  min={0}
                  max={10}
                  step="any"
                  value={raw}
                  onChange={(e) =>
                    updateRow(row.key, {
                      scores: { ...row.scores, [a.key]: e.target.value },
                    })
                  }
                  placeholder="–"
                  className={cn(
                    inputCls,
                    "tabular-nums text-center px-1",
                    // A 0–10 box has no room for spinners, and nobody dials
                    // a score a step at a time.
                    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    wrong &&
                      "border-destructive text-destructive focus:ring-destructive/40",
                  )}
                />
              );
            })}
            {row.isUs ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => rs.filter((r) => r.key !== row.key))
                }
                title="Remove competitor"
                className="w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}

        <AddButton
          label="Add a competitor"
          onClick={() => setRows((rs) => [...rs, emptyCompetitor()])}
        />
      </div>

      <FormButtons
        busy={busy}
        blocked={competitionBlocked(anchors, rows)}
        onCancel={onCancel}
        onSave={save}
      />
    </div>
  );
}

/** The saved matrix as it reads: who, and their score against each anchor. */
function CompetitionMatrixView({
  anchors,
  rows,
}: {
  anchors: string[];
  rows: PitchItem[];
}) {
  if (rows.length === 0) {
    return <Blank>{PITCH_SECTIONS.COMPETITION.emptyLabel}</Blank>;
  }
  const grid = competitionGrid(anchors.length, "");
  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="@max-md/card:hidden @md/card:grid gap-2 px-0.5" style={grid}>
        <span className={labelCls}>Who</span>
        {anchors.map((a) => (
          <span key={a} className={cn(labelCls, "truncate")}>
            {a}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid gap-2 items-stretch" style={grid}>
          <div className={readCellCls}>
            <span className="truncate">{row.heading || "—"}</span>
            {row.isUs && (
              <span className="ms-2 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/15 text-primary shrink-0">
                us
              </span>
            )}
          </div>
          {anchors.map((a) => (
            <div
              key={a}
              className={cn(readCellCls, "justify-center tabular-nums")}
            >
              {row.scores?.[a] ?? "—"}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** What the shares add up to as they're typed, so 100 isn't a guessing game. */
function ShareTally({ rows }: { rows: ItemDraft[] }) {
  const total = Math.round(shareTotal(rows) * 100) / 100;
  const done = Math.abs(total - 100) <= 0.01;
  return (
    <p className="text-s tabular-nums">
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
