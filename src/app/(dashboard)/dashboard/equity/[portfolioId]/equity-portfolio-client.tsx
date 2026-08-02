"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Layers,
  FileSignature,
  FileText,
  Pencil,
  PieChart,
  Paperclip,
  Upload,
  TrendingUp,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import {
  deleteEquityPortfolio,
  updateEquityProjectDescription,
  addEquityTranche,
  updateEquityTranche,
  deleteEquityTranche,
  addEquityContract,
  updateEquityContract,
  deleteEquityContract,
  addEquityGrant,
  updateEquityGrant,
  deleteEquityGrant,
  addEquityValuation,
  updateEquityValuation,
  deleteEquityValuation,
  type EquityPortfolioDTO,
} from "@/actions/equity";
import {
  EQUITY_FREQUENCY,
  EQUITY_LENGTH_UNIT,
  EQUITY_STRUCTURE,
  FEE_STATUS,
  computeVestedPct,
  computePortfolioEquity,
  computeContractEndDate,
  equityLabel,
  feeStatus,
  formatContractLength,
  formatPct,
  formatValuation,
  isTrancheDiluted,
  splitTranchesByDilution,
  valuationAsOf,
  valuationChangePct,
} from "@/lib/equity-math";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";
const selectCls =
  "w-full h-9 px-2 rounded-lg border border-border bg-card text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";
const labelCls = "text-[11px] font-medium text-muted-foreground mb-1 block";

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Digits and a single decimal point — also lets you paste "19.877%" straight in. */
function sanitizePct(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
}

/**
 * Percentages are typed freely to any precision (19.877), so this is a plain text
 * box with a % suffix rather than a number input with its stepper arrows.
 */
function PercentInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizePct(e.target.value))}
        placeholder={placeholder}
        className={cn(inputCls, "pr-7", className)}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground pointer-events-none">
        %
      </span>
    </div>
  );
}

/** Edit + Delete behind a ⋮ menu — every repeatable row on this page uses it. */
function RowActions({
  label,
  onEdit,
  onDelete,
  disabled,
  compact,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          "grid shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
          compact ? "size-5" : "size-6"
        )}
      >
        <MoreVertical
          className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
          strokeWidth={1.5}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          <span className="flex-1">Edit</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          <Trash2 className="h-4 w-4" />
          <span className="flex-1">Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EquityPortfolioClient({
  portfolio,
}: {
  portfolio: EquityPortfolioDTO;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  // Everything shown here is rolled up from the contracts and equity entries below.
  const summary = useMemo(() => computePortfolioEquity(portfolio), [portfolio]);
  const signedCount = portfolio.contracts.filter((c) => c.signed).length;

  async function handleDelete() {
    if (
      !confirm(
        `Delete the equity portfolio for ${portfolio.project.name}? This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteEquityPortfolio(portfolio.id);
      router.push("/dashboard/equity");
    } catch (err) {
      alert((err as Error).message || "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/equity"
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground transition-colors no-underline shrink-0"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        </Link>
        {portfolio.project.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portfolio.project.logoUrl}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[12px] font-semibold text-primary">
            {portfolio.project.name[0]?.toUpperCase()}
          </div>
        )}
        <h1 className="text-lg font-semibold text-foreground flex-1 truncate">
          {portfolio.project.name}
        </h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors disabled:opacity-50"
          title="Delete portfolio"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Computed summary — derived from the tables below, nothing stored */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card px-3.5 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">Total equity</p>
          <p className="text-[18px] font-semibold text-foreground tabular-nums">
            {formatPct(summary.granted)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3.5 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">
            Vested as of today
          </p>
          <p className="text-[18px] font-semibold text-primary tabular-nums">
            {formatPct(summary.vested)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3.5 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">Contracts</p>
          <p className="text-[18px] font-semibold text-foreground tabular-nums">
            {portfolio.contracts.length || "—"}
            {signedCount > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {" "}
                · {signedCount} signed
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3.5 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">
            Equity entries
          </p>
          <p className="text-[18px] font-semibold text-foreground tabular-nums">
            {portfolio.grants.length || "—"}
          </p>
        </div>
      </div>

      {/* The project's own description, edited in place */}
      <ProjectDescriptionCard portfolio={portfolio} />

      {/* Contracts — repeatable related table */}
      <ContractsTable portfolio={portfolio} />

      {/* Equity granted per contract — repeatable related table */}
      <GrantsTable portfolio={portfolio} />

      {/* Company valuation over time — what the equity above is actually worth */}
      <ValuationsTable
        portfolio={portfolio}
        currency={portfolio.valuationCurrency}
      />

      {/* Deal-level dilution schedule. Tranches now live on the equity entries
          that use them, so this only appears for older portfolio-wide rows. */}
      {portfolio.tranches.length > 0 && (
        <TranchesTable
          portfolio={portfolio}
          currency={portfolio.valuationCurrency}
        />
      )}
    </div>
  );
}

/**
 * The project's description, not the portfolio's — it's the same column the
 * create-project dialog and project settings write, so this stays in step with
 * whatever the project page shows.
 */
function ProjectDescriptionCard({
  portfolio,
}: {
  portfolio: EquityPortfolioDTO;
}) {
  const router = useRouter();
  const stored = portfolio.project.description ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await updateEquityProjectDescription(portfolio.id, draft);
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save description");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FileText
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-[13px] font-semibold text-foreground">
            Description
          </h2>
        </div>
        {!editing && (
          <button
            onClick={() => {
              // Re-seed from the server value so a cancelled edit is discarded.
              setDraft(stored);
              setEditing(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
            Edit
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Shared with the project — editing it here updates the project page too.
      </p>

      {editing ?
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Brief project description..."
            className={cn(inputCls, "h-auto py-2 resize-y")}
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      : stored ?
        <p className="text-[13px] text-foreground whitespace-pre-wrap">
          {stored}
        </p>
      : <p className="text-[12px] text-muted-foreground py-2">
          No description yet.
        </p>
      }
    </div>
  );
}

// The end date isn't part of the draft — it's derived from start + length.
type ContractDraft = {
  title: string;
  signed: boolean;
  startDate: string;
  lengthValue: string;
  lengthUnit: string;
  monthlyFee: string;
  notes: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  fileMimeType: string;
};

const EMPTY_CONTRACT: ContractDraft = {
  title: "",
  signed: false,
  startDate: "",
  lengthValue: "",
  lengthUnit: "YEARS",
  monthlyFee: "",
  notes: "",
  fileUrl: "",
  fileName: "",
  fileSize: null,
  fileMimeType: "",
};

function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function contractPayload(draft: ContractDraft) {
  return {
    title: draft.title || null,
    signed: draft.signed,
    startDate: draft.startDate || null,
    lengthValue: draft.lengthValue ? parseFloat(draft.lengthValue) : null,
    lengthUnit: draft.lengthUnit,
    monthlyFee: draft.monthlyFee ? parseFloat(draft.monthlyFee) : null,
    notes: draft.notes || null,
    fileUrl: draft.fileUrl || null,
    fileName: draft.fileName || null,
    fileSize: draft.fileSize,
    fileMimeType: draft.fileMimeType || null,
  };
}

function ContractsTable({ portfolio }: { portfolio: EquityPortfolioDTO }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd(draft: ContractDraft) {
    setBusy(true);
    try {
      await addEquityContract(portfolio.id, contractPayload(draft));
      setAdding(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add contract");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(contractId: string, draft: ContractDraft) {
    setBusy(true);
    try {
      await updateEquityContract(contractId, contractPayload(draft));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save contract");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(contractId: string) {
    if (!confirm("Delete this contract?")) return;
    setBusy(true);
    try {
      await deleteEquityContract(contractId);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete contract");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FileSignature
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-[13px] font-semibold text-foreground">
            Contracts
          </h2>
          {portfolio.contracts.length > 0 && (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {portfolio.contracts.length}
            </span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add contract
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Every agreement behind this equity — founders agreement, MOA,
        amendments.
      </p>

      {portfolio.contracts.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {portfolio.contracts.map((c, idx) =>
            editingId === c.id ? (
              <ContractForm
                key={c.id}
                initial={{
                  title: c.title ?? "",
                  signed: c.signed,
                  startDate: toDateInput(c.startDate),
                  lengthValue: c.lengthValue?.toString() ?? "",
                  lengthUnit: c.lengthUnit ?? "YEARS",
                  monthlyFee: c.monthlyFee?.toString() ?? "",
                  notes: c.notes ?? "",
                  fileUrl: c.fileUrl ?? "",
                  fileName: c.fileName ?? "",
                  fileSize: c.fileSize,
                  fileMimeType: c.fileMimeType ?? "",
                }}
                currency={portfolio.valuationCurrency}
                busy={busy}
                submitLabel="Save"
                onSubmit={(draft) => handleUpdate(c.id, draft)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={c.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <span className="text-[11px] font-mono text-muted-foreground/60 w-6 shrink-0 pt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-foreground">
                      {c.title || `Contract ${idx + 1}`}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        c.signed
                          ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                          : "text-amber-400 bg-amber-500/15 border-amber-500/30"
                      )}
                    >
                      {c.signed ? "Signed" : "Not signed"}
                    </span>
                    {c.monthlyFee != null && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          feeStatus(c.endDate) === "ACTUAL"
                            ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                            : "text-sky-400 bg-sky-500/15 border-sky-500/30"
                        )}
                      >
                        {formatValuation(
                          c.monthlyFee,
                          portfolio.valuationCurrency
                        )}
                        /mo · {FEE_STATUS[feeStatus(c.endDate)]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.startDate || c.endDate ? (
                      <>
                        {c.startDate
                          ? new Date(c.startDate).toLocaleDateString()
                          : "—"}{" "}
                        →{" "}
                        {c.endDate
                          ? new Date(c.endDate).toLocaleDateString()
                          : "—"}
                      </>
                    ) : (
                      "No term set"
                    )}
                    {formatContractLength(c.lengthValue, c.lengthUnit) && (
                      <>
                        {" "}
                        · {formatContractLength(c.lengthValue, c.lengthUnit)}
                      </>
                    )}
                  </p>
                  {c.fileUrl && (
                    <a
                      href={c.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md border border-border bg-muted/40 text-[11px] text-foreground no-underline hover:border-muted-foreground/40 transition-colors max-w-full"
                    >
                      <Paperclip
                        className="w-3 h-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">
                        {c.fileName || "Contract file"}
                      </span>
                      {formatFileSize(c.fileSize) && (
                        <span className="text-muted-foreground/60 shrink-0">
                          {formatFileSize(c.fileSize)}
                        </span>
                      )}
                    </a>
                  )}
                  {c.notes && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 whitespace-pre-wrap">
                      {c.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <RowActions
                    label="Contract options"
                    disabled={busy}
                    onEdit={() => {
                      setEditingId(c.id);
                      setAdding(false);
                    }}
                    onDelete={() => handleDelete(c.id)}
                  />
                </div>
              </div>
            )
          )}
        </div>
      )}

      {adding && (
        <ContractForm
          initial={EMPTY_CONTRACT}
          currency={portfolio.valuationCurrency}
          busy={busy}
          submitLabel="Add contract"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {portfolio.contracts.length === 0 && !adding && (
        <p className="text-[12px] text-muted-foreground py-2">
          No contracts added yet.
        </p>
      )}
    </div>
  );
}

function ContractForm({
  initial,
  currency,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ContractDraft;
  currency: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: ContractDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ContractDraft>(initial);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mirrors what the server will store, so the form shows the real end date.
  const endDate = computeContractEndDate(
    draft.startDate || null,
    draft.lengthValue ? parseFloat(draft.lengthValue) : null,
    draft.lengthUnit
  );
  const status = feeStatus(endDate);

  function set<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const uploading = uploadPct !== null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadPct(0);
    try {
      const uploaded = await uploadFileToR2(file, setUploadPct);
      setDraft((d) => ({
        ...d,
        fileUrl: uploaded.url,
        fileName: uploaded.filename,
        fileSize: uploaded.fileSize,
        fileMimeType: uploaded.mimeType ?? "",
      }));
    } catch (err) {
      alert((err as Error).message || "Upload failed");
    } finally {
      setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearFile() {
    setDraft((d) => ({
      ...d,
      fileUrl: "",
      fileName: "",
      fileSize: null,
      fileMimeType: "",
    }));
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3.5 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Title</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Founders agreement"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Signed</label>
          <select
            value={draft.signed ? "yes" : "no"}
            onChange={(e) => set("signed", e.target.value === "yes")}
            className={cn(
              selectCls,
              draft.signed &&
                "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            )}
          >
            <option value="no">Not signed</option>
            <option value="yes">Signed</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Start date</label>
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Contract length</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min="0"
              value={draft.lengthValue}
              onChange={(e) => set("lengthValue", e.target.value)}
              placeholder="e.g. 12"
              className={cn(inputCls, "flex-1 min-w-0")}
            />
            <select
              value={draft.lengthUnit}
              onChange={(e) => set("lengthUnit", e.target.value)}
              className={cn(selectCls, "w-[104px] shrink-0")}
            >
              {Object.entries(EQUITY_LENGTH_UNIT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>End date — calculated</label>
          <div
            className={cn(
              "flex h-9 items-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-[13px]",
              endDate ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {endDate
              ? new Date(endDate).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })
              : "Set a start date and length"}
          </div>
        </div>
        <div>
          <label className={labelCls}>Monthly recurring fee</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              value={draft.monthlyFee}
              onChange={(e) => set("monthlyFee", e.target.value)}
              placeholder="e.g. 1500"
              className={cn(inputCls, "flex-1 min-w-0")}
            />
            <span className="flex h-9 w-[104px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-[13px] text-muted-foreground">
              {currency}
            </span>
          </div>
        </div>
        <div>
          <label className={labelCls}>Billing status — calculated</label>
          <div
            className={cn(
              "flex h-9 items-center rounded-lg border border-dashed px-3 text-[13px]",
              !draft.monthlyFee
                ? "border-border bg-muted/30 text-muted-foreground"
                : status === "ACTUAL"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-400"
            )}
          >
            {!draft.monthlyFee
              ? "No recurring fee"
              : status === "ACTUAL"
                ? `${FEE_STATUS.ACTUAL} — term ended, they're paying`
                : `${FEE_STATUS.ESTIMATED} — starts when the term ends`}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Contract file</label>
          {draft.fileUrl ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-muted/30">
              <Paperclip
                className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
              <a
                href={draft.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-foreground truncate no-underline hover:underline"
              >
                {draft.fileName || "Contract file"}
              </a>
              {formatFileSize(draft.fileSize) && (
                <span className="text-[11px] text-muted-foreground/60 shrink-0">
                  {formatFileSize(draft.fileSize)}
                </span>
              )}
              <button
                type="button"
                onClick={clearFile}
                disabled={busy}
                className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Remove file"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
              className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border border-dashed border-border bg-card text-[13px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
              {uploading
                ? `Uploading… ${uploadPct}%`
                : "Upload the signed document (PDF, image, doc)"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={handleFile}
            className="hidden"
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="e.g. signed between Abdulaziz and the founders, not Nizek"
            className={cn(inputCls, "h-auto py-2 resize-y")}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || uploading}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

type TrancheDraft = { equityPct: string; startsAtValuation: string };

type GrantDraft = {
  contractId: string;
  structureType: string;
  equityPct: string;
  dividendFrequency: string;
  notes: string;
  tranches: TrancheDraft[];
};

const EMPTY_GRANT: GrantDraft = {
  contractId: "",
  structureType: "FIXED",
  equityPct: "",
  dividendFrequency: "QUARTERLY",
  notes: "",
  tranches: [],
};

function parsedTranches(draft: GrantDraft) {
  return draft.tranches.map((t) => ({
    equityPct: parseFloat(t.equityPct),
    startsAtValuation: parseAmount(t.startsAtValuation),
  }));
}

function contractLabel(
  contracts: EquityPortfolioDTO["contracts"],
  contractId: string | null
): string {
  if (!contractId) return "No contract linked";
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx === -1) return "Contract removed";
  return contracts[idx].title || `Contract ${idx + 1}`;
}

function GrantsTable({ portfolio }: { portfolio: EquityPortfolioDTO }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grantedTotal = portfolio.grants.reduce(
    (sum, g) => sum + g.equityPct,
    0
  );
  // Decides which dilution tranches have been triggered.
  const currentValuation = useMemo(
    () => valuationAsOf(portfolio.valuations)?.amount ?? null,
    [portfolio.valuations]
  );

  function payload(draft: GrantDraft) {
    return {
      contractId: draft.contractId || null,
      structureType: draft.structureType,
      equityPct: draft.equityPct ? parseFloat(draft.equityPct) : undefined,
      dividendFrequency: draft.dividendFrequency || null,
      notes: draft.notes || null,
      tranches:
        draft.structureType === "TRANCHED" ? parsedTranches(draft) : undefined,
    };
  }

  async function handleAdd(draft: GrantDraft) {
    setBusy(true);
    try {
      await addEquityGrant(portfolio.id, payload(draft));
      setAdding(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add equity");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(grantId: string, draft: GrantDraft) {
    setBusy(true);
    try {
      await updateEquityGrant(grantId, payload(draft));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save equity");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(grantId: string) {
    if (!confirm("Delete this equity entry?")) return;
    setBusy(true);
    try {
      await deleteEquityGrant(grantId);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete equity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <PieChart
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-[13px] font-semibold text-foreground">Equity</h2>
          {portfolio.grants.length > 0 && (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {formatPct(grantedTotal)} across {portfolio.grants.length}
            </span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            disabled={portfolio.contracts.length === 0}
            title={
              portfolio.contracts.length === 0
                ? "Add a contract first"
                : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add equity
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Equity granted under each contract. Pick the structure that matches the
        deal — a flat percentage, a non-diluted stake that dilutes in tranches
        as the company hits valuation milestones, or a percentage that pays
        dividends. Each entry vests monthly across the term of its contract.
      </p>

      {portfolio.contracts.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          Add a contract above first — equity is always tied to one.
        </p>
      ) : (
        <>
          {portfolio.grants.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {portfolio.grants.map((g) => {
                const contract = portfolio.contracts.find(
                  (c) => c.id === g.contractId
                );
                // Vesting always follows the linked contract's term.
                const start = contract?.startDate ?? null;
                const end = contract?.endDate ?? null;
                const vested = computeVestedPct({
                  totalEquityPct: g.equityPct,
                  vestingStartDate: start,
                  vestingEndDate: end,
                  vestingFrequency: null,
                });

                return editingId === g.id ? (
                  <GrantForm
                    key={g.id}
                    contracts={portfolio.contracts}
                    currency={portfolio.valuationCurrency}
                    initial={{
                      contractId: g.contractId ?? "",
                      structureType: g.structureType,
                      equityPct: g.equityPct.toString(),
                      dividendFrequency: g.dividendFrequency ?? "QUARTERLY",
                      notes: g.notes ?? "",
                      tranches: g.tranches.map((t) => ({
                        equityPct: t.equityPct.toString(),
                        startsAtValuation:
                          t.startsAtValuation.toLocaleString("en-US"),
                      })),
                    }}
                    busy={busy}
                    submitLabel="Save"
                    onSubmit={(draft) => handleUpdate(g.id, draft)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div
                    key={g.id}
                    className="rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-foreground">
                            {contractLabel(portfolio.contracts, g.contractId)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-muted-foreground bg-muted/40 border-border">
                            {equityLabel(EQUITY_STRUCTURE, g.structureType)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-muted-foreground bg-muted/40 border-border tabular-nums">
                            {formatPct(g.equityPct)} granted
                          </span>
                          {vested != null && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-primary bg-primary/10 border-primary/30 tabular-nums">
                              {formatPct(vested)} vested
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {start || end ? (
                            <>
                              {start
                                ? new Date(start).toLocaleDateString()
                                : "—"}{" "}
                              → {end ? new Date(end).toLocaleDateString() : "—"}
                              <span className="text-muted-foreground/50">
                                {" "}
                                (contract term)
                              </span>
                            </>
                          ) : (
                            "No term on the contract"
                          )}
                          {g.structureType === "DIVIDEND" &&
                            g.dividendFrequency && (
                              <>
                                {" "}
                                ·{" "}
                                <span className="text-foreground/80">
                                  {equityLabel(
                                    EQUITY_FREQUENCY,
                                    g.dividendFrequency
                                  )}{" "}
                                  dividends
                                </span>
                              </>
                            )}
                        </p>
                        {g.notes && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1 whitespace-pre-wrap">
                            {g.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <RowActions
                          label="Equity options"
                          disabled={busy}
                          onEdit={() => {
                            setEditingId(g.id);
                            setAdding(false);
                          }}
                          onDelete={() => handleDelete(g.id)}
                        />
                      </div>
                    </div>

                    {g.structureType === "TRANCHED" && (
                      <GrantTranches
                        portfolioId={portfolio.id}
                        grant={g}
                        currency={portfolio.valuationCurrency}
                        currentValuation={currentValuation}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {adding && (
            <GrantForm
              contracts={portfolio.contracts}
              currency={portfolio.valuationCurrency}
              initial={EMPTY_GRANT}
              busy={busy}
              submitLabel="Add equity"
              onSubmit={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}

          {portfolio.grants.length === 0 && !adding && (
            <p className="text-[12px] text-muted-foreground py-2">
              No equity defined yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The dilution schedule for one tranched grant: each row is a slice of the
 * stake that starts diluting once the company reaches that valuation. The
 * rows add up to the grant total.
 */
function GrantTranches({
  portfolioId,
  grant,
  currency,
  currentValuation,
}: {
  portfolioId: string;
  grant: EquityPortfolioDTO["grants"][number];
  currency: string;
  currentValuation: number | null;
}) {
  const router = useRouter();
  const [equityPct, setEquityPct] = useState("");
  const [valuation, setValuation] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TrancheDraft>({
    equityPct: "",
    startsAtValuation: "",
  });

  const split = useMemo(
    () => splitTranchesByDilution(grant.tranches, currentValuation),
    [grant.tranches, currentValuation]
  );

  function cancelAdd() {
    setAdding(false);
    setEquityPct("");
    setValuation("");
  }

  function startEdit(
    tranche: EquityPortfolioDTO["grants"][number]["tranches"][number]
  ) {
    setAdding(false);
    setEditingId(tranche.id);
    setEditDraft({
      equityPct: tranche.equityPct.toString(),
      startsAtValuation: tranche.startsAtValuation.toLocaleString("en-US"),
    });
  }

  async function handleSaveEdit(trancheId: string) {
    const pct = parseFloat(editDraft.equityPct);
    const val = parseAmount(editDraft.startsAtValuation);
    if (Number.isNaN(pct) || Number.isNaN(val)) return;
    setBusy(true);
    try {
      await updateEquityTranche(trancheId, {
        equityPct: pct,
        startsAtValuation: val,
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save tranche");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const pct = parseFloat(equityPct);
    const val = parseAmount(valuation);
    if (isNaN(pct) || isNaN(val)) return;
    setBusy(true);
    try {
      await addEquityTranche(portfolioId, {
        equityPct: pct,
        startsAtValuation: val,
        grantId: grant.id,
      });
      cancelAdd();
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add tranche");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(trancheId: string) {
    setBusy(true);
    try {
      await deleteEquityTranche(trancheId);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete tranche");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 pt-2.5 border-t border-border/60">
      <label className={labelCls}>Dilution tranches</label>
      <div className="rounded-lg border border-dashed border-border p-2.5 space-y-2">
        {grant.tranches.length === 0 && !adding && (
          <p className="text-[11px] text-muted-foreground">
            The stake is granted non-diluted. Add a row per milestone — e.g. 5%
            dilutes at 2,000,000, then 5% at 4,000,000, then 10% at 6,000,000.
          </p>
        )}

        {grant.tranches.map((t) => {
          const diluted = isTrancheDiluted(
            t.startsAtValuation,
            currentValuation
          );
          return editingId === t.id ? (
            <div key={t.id} className="flex items-center gap-2">
              <PercentInput
                value={editDraft.equityPct}
                onChange={(v) => setEditDraft((d) => ({ ...d, equityPct: v }))}
                placeholder="Equity"
                className="w-24 h-8 text-[12px]"
              />
              <span className="text-[11px] text-muted-foreground shrink-0">
                dilutes at
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={editDraft.startsAtValuation}
                onChange={(e) =>
                  setEditDraft((d) => ({
                    ...d,
                    startsAtValuation: sanitizeAmount(e.target.value),
                  }))
                }
                placeholder={`Valuation (${currency})`}
                className={cn(inputCls, "flex-1 h-8 text-[12px]")}
              />
              <button
                onClick={() => handleSaveEdit(t.id)}
                disabled={
                  busy ||
                  !(parseFloat(editDraft.equityPct) > 0) ||
                  Number.isNaN(parseAmount(editDraft.startsAtValuation))
                }
                className="px-2.5 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                disabled={busy}
                className="px-2 h-8 rounded-lg text-[11px] text-muted-foreground hover:bg-muted transition-colors shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            // Mirrors the edit row's layout, but as flat read-only fields so the
            // saved schedule lines up with the form instead of reflowing.
            <div key={t.id} className="flex items-center gap-2">
              <div className="w-24 h-8 px-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between shrink-0">
                <span className="text-[12px] font-medium text-foreground tabular-nums">
                  {Math.round(t.equityPct * 1000) / 1000}
                </span>
                <span className="text-[12px] text-muted-foreground">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                dilutes at
              </span>
              <div className="flex-1 min-w-0 h-8 px-3 rounded-lg border border-border bg-muted/30 flex items-center gap-1">
                <span className="text-[12px] text-foreground tabular-nums truncate">
                  {t.startsAtValuation.toLocaleString("en-US")}
                </span>
                <span className="text-[12px] text-muted-foreground shrink-0">
                  {currency}
                </span>
              </div>
              {currentValuation != null && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
                    diluted
                      ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                      : "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                  )}
                >
                  {diluted ? "Diluted" : "Not diluted"}
                </span>
              )}
              <RowActions
                label="Tranche options"
                compact
                disabled={busy}
                onEdit={() => startEdit(t)}
                onDelete={() => handleDelete(t.id)}
              />
            </div>
          );
        })}

        {adding && (
          <div className="flex items-center gap-2">
            <PercentInput
              value={equityPct}
              onChange={setEquityPct}
              placeholder="Equity"
              className="w-24 h-8 text-[12px]"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">
              dilutes at
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valuation}
              onChange={(e) => setValuation(sanitizeAmount(e.target.value))}
              placeholder={`Valuation (${currency})`}
              className={cn(inputCls, "flex-1 h-8 text-[12px]")}
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={busy || !(parseFloat(equityPct) > 0) || !valuation}
              className="px-2.5 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancelAdd}
              disabled={busy}
              className="px-2 h-8 rounded-lg text-[11px] text-muted-foreground hover:bg-muted transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <button
            onClick={() => setAdding(true)}
            disabled={busy || adding}
            className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Add tranche
          </button>
          {grant.tranches.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Total{" "}
              <span className="text-foreground font-medium">
                {formatPct(grant.equityPct)}
              </span>
            </span>
          )}
        </div>
      </div>

      {currentValuation != null && grant.tranches.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          At {formatValuation(currentValuation, currency)}:{" "}
          <span className="text-amber-400 font-medium">
            {formatPct(split.diluted)}
          </span>{" "}
          diluted ·{" "}
          <span className="text-emerald-400 font-medium">
            {formatPct(split.nonDiluted)}
          </span>{" "}
          still non-diluted
        </p>
      )}
    </div>
  );
}

/** One row of the schedule being drafted, before the grant is saved. */
function TrancheDraftEditor({
  tranches,
  currency,
  onChange,
}: {
  tranches: TrancheDraft[];
  currency: string;
  onChange: (tranches: TrancheDraft[]) => void;
}) {
  function update(index: number, patch: Partial<TrancheDraft>) {
    onChange(tranches.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const total = tranches.reduce((sum, t) => {
    const pct = parseFloat(t.equityPct);
    return sum + (Number.isNaN(pct) ? 0 : pct);
  }, 0);

  return (
    <div className="rounded-lg border border-dashed border-border p-2.5 space-y-2">
      {tranches.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          The stake is granted non-diluted. Add a row per milestone — e.g. 5%
          dilutes at 2,000,000, then 5% at 4,000,000, then 10% at 6,000,000.
        </p>
      ) : (
        tranches.map((tranche, i) => (
          <div key={i} className="flex items-center gap-2">
            <PercentInput
              value={tranche.equityPct}
              onChange={(v) => update(i, { equityPct: v })}
              placeholder="Equity"
              className="w-24 h-8 text-[12px]"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">
              dilutes at
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={tranche.startsAtValuation}
              onChange={(e) =>
                update(i, { startsAtValuation: sanitizeAmount(e.target.value) })
              }
              placeholder={`Valuation (${currency})`}
              className={cn(inputCls, "flex-1 h-8 text-[12px]")}
            />
            <button
              type="button"
              onClick={() => onChange(tranches.filter((_, idx) => idx !== i))}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              title="Remove tranche"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))
      )}
      <div className="flex items-center justify-between pt-0.5">
        <button
          type="button"
          onClick={() =>
            onChange([...tranches, { equityPct: "", startsAtValuation: "" }])
          }
          className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add tranche
        </button>
        {tranches.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Total{" "}
            <span className="text-foreground font-medium">
              {formatPct(total)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function GrantForm({
  contracts,
  currency,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  contracts: EquityPortfolioDTO["contracts"];
  currency: string;
  initial: GrantDraft;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: GrantDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<GrantDraft>(initial);
  const tranched = draft.structureType === "TRANCHED";

  function set<K extends keyof GrantDraft>(key: K, value: GrantDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // A tranched grant has no total of its own, so it needs at least one complete
  // tranche to add up to anything.
  const tranchesValid =
    draft.tranches.length > 0 &&
    draft.tranches.every(
      (t) =>
        parseFloat(t.equityPct) > 0 &&
        !Number.isNaN(parseAmount(t.startsAtValuation))
    );

  const valid =
    !!draft.contractId &&
    (tranched
      ? tranchesValid
      : !!draft.equityPct && !Number.isNaN(parseFloat(draft.equityPct)));

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3.5 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Contract</label>
          <select
            value={draft.contractId}
            onChange={(e) => set("contractId", e.target.value)}
            className={selectCls}
          >
            <option value="">Select contract…</option>
            {contracts.map((c, i) => (
              <option key={c.id} value={c.id}>
                {c.title || `Contract ${i + 1}`}
                {c.signed ? " (signed)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Structure</label>
          <select
            value={draft.structureType}
            onChange={(e) => set("structureType", e.target.value)}
            className={selectCls}
          >
            {Object.entries(EQUITY_STRUCTURE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {tranched ? (
          <div className="md:col-span-2">
            <label className={labelCls}>Dilution tranches</label>
            <TrancheDraftEditor
              tranches={draft.tranches}
              currency={currency}
              onChange={(tranches) => set("tranches", tranches)}
            />
          </div>
        ) : (
          <div>
            <label className={labelCls}>Equity %</label>
            <PercentInput
              value={draft.equityPct}
              onChange={(v) => set("equityPct", v)}
              placeholder="e.g. 19.877"
            />
          </div>
        )}
        {draft.structureType === "DIVIDEND" && (
          <div>
            <label className={labelCls}>Dividend frequency</label>
            <select
              value={draft.dividendFrequency}
              onChange={(e) => set("dividendFrequency", e.target.value)}
              className={selectCls}
            >
              {Object.entries(EQUITY_FREQUENCY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="md:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="e.g. cliff, conditions attached to this grant"
            className={cn(inputCls, "h-auto py-2 resize-y")}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || !valid}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

type ValuationDraft = {
  valuedAt: string;
  amount: string;
  notes: string;
};

const EMPTY_VALUATION: ValuationDraft = { valuedAt: "", amount: "", notes: "" };

/** Digits, thousands separators and one decimal point — "2,000,000" pastes in fine. */
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function valuationPayload(draft: ValuationDraft) {
  return {
    valuedAt: draft.valuedAt,
    amount: parseAmount(draft.amount),
    notes: draft.notes || null,
  };
}

function ValuationsTable({
  portfolio,
  currency,
}: {
  portfolio: EquityPortfolioDTO;
  currency: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arrives newest-first from the server, so the next row is the previous
  // valuation — that's what each row's change is measured against.
  const { valuations } = portfolio;

  async function handleAdd(draft: ValuationDraft) {
    setBusy(true);
    try {
      await addEquityValuation(portfolio.id, valuationPayload(draft));
      setAdding(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add valuation");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(valuationId: string, draft: ValuationDraft) {
    setBusy(true);
    try {
      await updateEquityValuation(valuationId, valuationPayload(draft));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save valuation");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(valuationId: string) {
    if (!confirm("Delete this valuation?")) return;
    setBusy(true);
    try {
      await deleteEquityValuation(valuationId);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete valuation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-[13px] font-semibold text-foreground">
            Valuations
          </h2>
          {valuations.length > 0 && (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {valuations.length}
            </span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add valuation
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        What the company was worth on a given date. The most recent one prices
        the equity above and decides which dilution tranches have been
        triggered.
      </p>

      {valuations.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {valuations.map((v, idx) => {
            const change = valuationChangePct(
              v.amount,
              valuations[idx + 1]?.amount
            );
            return editingId === v.id ? (
              <ValuationForm
                key={v.id}
                initial={{
                  valuedAt: toDateInput(v.valuedAt),
                  amount: v.amount.toLocaleString("en-US"),
                  notes: v.notes ?? "",
                }}
                currency={currency}
                busy={busy}
                submitLabel="Save"
                onSubmit={(draft) => handleUpdate(v.id, draft)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={v.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-foreground tabular-nums">
                      {formatValuation(v.amount, currency)}
                    </span>
                    {change != null && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium tabular-nums",
                          change >= 0
                            ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                            : "text-rose-400 bg-rose-500/15 border-rose-500/30"
                        )}
                      >
                        {change >= 0 ? "+" : ""}
                        {formatPct(change)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(v.valuedAt).toLocaleDateString()}
                  </p>
                  {v.notes && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 whitespace-pre-wrap">
                      {v.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <RowActions
                    label="Valuation options"
                    disabled={busy}
                    onEdit={() => {
                      setEditingId(v.id);
                      setAdding(false);
                    }}
                    onDelete={() => handleDelete(v.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <ValuationForm
          initial={EMPTY_VALUATION}
          currency={currency}
          busy={busy}
          submitLabel="Add valuation"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {valuations.length === 0 && !adding && (
        <p className="text-[12px] text-muted-foreground py-2">
          No valuations recorded yet.
        </p>
      )}
    </div>
  );
}

function ValuationForm({
  initial,
  currency,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ValuationDraft;
  currency: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: ValuationDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ValuationDraft>(initial);

  function set<K extends keyof ValuationDraft>(
    key: K,
    value: ValuationDraft[K]
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const valid = !!draft.valuedAt && !Number.isNaN(parseAmount(draft.amount));

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3.5 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={draft.valuedAt}
            onChange={(e) => set("valuedAt", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Valuation ({currency})</label>
          <input
            type="text"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => set("amount", sanitizeAmount(e.target.value))}
            placeholder="e.g. 2,000,000"
            className={inputCls}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="e.g. seed round, post-money"
            className={cn(inputCls, "h-auto py-2 resize-y")}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || !valid}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function TranchesTable({
  portfolio,
  currency,
}: {
  portfolio: EquityPortfolioDTO;
  currency: string;
}) {
  const router = useRouter();
  const [equityPct, setEquityPct] = useState("");
  const [valuation, setValuation] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const pct = parseFloat(equityPct);
    const val = parseFloat(valuation.replace(/,/g, ""));
    if (isNaN(pct) || isNaN(val)) return;
    setBusy(true);
    try {
      await addEquityTranche(portfolio.id, {
        equityPct: pct,
        startsAtValuation: val,
      });
      setEquityPct("");
      setValuation("");
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add tranche");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(trancheId: string) {
    setBusy(true);
    try {
      await deleteEquityTranche(trancheId);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete tranche");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-[13px] font-semibold text-foreground">
          Dilution tranches — deal level
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Older portfolio-wide milestones. New tranches belong to an equity entry
        above.
      </p>

      {portfolio.tranches.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {portfolio.tranches.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-[11px] font-mono text-muted-foreground/60 w-6 shrink-0">
                {t.order}
              </span>
              <span className="text-[13px] font-semibold text-foreground tabular-nums w-16">
                {formatPct(t.equityPct)}
              </span>
              <span className="text-[12px] text-muted-foreground flex-1">
                from {formatValuation(t.startsAtValuation, currency)} valuation
              </span>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={busy}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                title="Remove tranche"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <PercentInput
          value={equityPct}
          onChange={setEquityPct}
          placeholder="Equity"
          className="w-28"
        />
        <input
          type="text"
          inputMode="numeric"
          value={valuation}
          onChange={(e) => setValuation(e.target.value)}
          placeholder={`Valuation (${currency})`}
          className={cn(inputCls, "flex-1")}
        />
        <button
          onClick={handleAdd}
          disabled={busy || !equityPct || !valuation}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add tranche
        </button>
      </div>
    </div>
  );
}
