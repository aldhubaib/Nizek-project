"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  BarChart3,
  GripVertical,
  Trash2,
  Plus,
  Layers,
  FileSignature,
  PieChart,
  Paperclip,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OpportunitySection } from "@/components/equity/opportunity-section";
import { PitchSectionCard } from "@/components/equity/pitch-section";
import { ProductSection } from "@/components/equity/product-section";
import { MarketSizeSection } from "@/components/equity/market-size-section";
import { TractionSection } from "@/components/equity/traction-section";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { ConfirmDeleteDialog } from "@/components/equity/confirm-delete-dialog";
import { GrowingTextarea } from "@/components/equity/growing-textarea";
import {
  RecordBadge,
  RecordDetail,
  RecordDetails,
  RecordRow,
  RowActions,
} from "@/components/equity/record-row";
import { PortfolioMenu } from "@/components/equity/portfolio-menu";
import { PerformanceSection } from "@/components/equity/performance-section";
import { TeamSection } from "@/components/equity/team-section";
import { PageHeader } from "@/components/page-header";
import { uploadFileToR2 } from "@/lib/upload";
import {
  addEquityTranche,
  deleteEquityTranche,
  addEquityContract,
  updateEquityContract,
  deleteEquityContract,
  addEquitySet,
  updateEquitySet,
  deleteEquitySet,
  addEquityFinancialReport,
  updateEquityFinancialReport,
  deleteEquityFinancialReport,
  setEquityReportFields,
  type EquityHolderDTO,
  type EquityMetricDTO,
  type EquityRoleDTO,
  type EquityPortfolioDTO,
} from "@/actions/equity";
import {
  EQUITY_LENGTH_UNIT,
  EQUITY_PERIOD_TYPE,
  EQUITY_STRUCTURE,
  FEE_STATUS,
  computePortfolioEquity,
  currentSet,
  computeContractEndDate,
  equityLabel,
  evaluateFormula,
  feeStatus,
  formulaLabel,
  isDateMetric,
  isFieldAnswered,
  isFormulaMetric,
  isOngoing,
  formatContractLength,
  formatMetricValue,
  formatPeriodLabel,
  splitTotal,
  periodStartFor,
  quarterOf,
  formatPct,
  formatValuation,
  isTrancheDiluted,
  splitTranchesByDilution,
} from "@/lib/equity-math";

// The spin-button rules strip the steppers from every type="number" field here.
// They're a poor fit for figures typed in full — the arrows sit over the text,
// invite a stray scroll-wheel edit, and nudge by 1 on values in the thousands.
const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0";
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
export function EquityPortfolioClient({
  portfolio,
  holders,
  roles,
  metrics,
}: {
  portfolio: EquityPortfolioDTO;
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
  metrics: EquityMetricDTO[];
}) {
  // Everything shown here is rolled up from the contracts and dated splits below.
  const summary = useMemo(() => computePortfolioEquity(portfolio), [portfolio]);
  const currentPct = summary.held;
  const signedCount = portfolio.contracts.filter((c) => c.signed).length;
  const latestSet = useMemo(() => currentSet(portfolio.sets), [portfolio.sets]);
  // Every pitch row on the portfolio; each module takes only its own section.
  const pitchItems = portfolio.opportunity?.items ?? [];

  return (
    <div>
      <PageHeader hasMenu>
        <Link
          href="/dashboard/equity"
          aria-label="Back to equity"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors no-underline shrink-0"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        </Link>
        {portfolio.project.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portfolio.project.logoUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
            {portfolio.project.name[0]?.toUpperCase()}
          </div>
        )}
        <h1 className="text-sm font-semibold text-foreground truncate">
          {portfolio.project.name}
        </h1>
        <PortfolioMenu
          portfolioId={portfolio.id}
          projectName={portfolio.project.name}
        />
      </PageHeader>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        {/* Computed summary — derived from the tables below, nothing stored */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-[10px] text-muted-foreground mb-1">
              {currentPct !== summary.granted
                ? "Our equity today"
                : "Our equity"}
            </p>
            <p className="text-[18px] font-semibold text-foreground tabular-nums">
              {formatPct(currentPct)}
            </p>
            {/* Only worth saying once a later split has actually moved it. */}
            {currentPct !== summary.granted && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatPct(summary.granted)} granted
              </p>
            )}
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
              {latestSet?.grants.length || "—"}
            </p>
          </div>
        </div>

        {/* The pitch, module by module, in the order a deck tells it. Each one
          owns its own save, so editing one can't disturb another. */}
        <OpportunitySection
          portfolioId={portfolio.id}
          opportunity={portfolio.opportunity}
          description={portfolio.project.description}
          liveDate={portfolio.liveDate}
        />

        {/* What has actually been built, written and shown */}
        <ProductSection
          portfolioId={portfolio.id}
          text={portfolio.opportunity?.product ?? null}
          photos={portfolio.productPhotos}
        />

        {/* How big the market is, tier by tier — drawn as rings in the report */}
        <MarketSizeSection
          portfolioId={portfolio.id}
          tiers={portfolio.marketTiers}
          currency={portfolio.valuationCurrency}
        />

        {/* How the money is made, and how the first users are reached */}
        {["BUSINESS_MODEL", "MARKET_ADOPTION"].map((section) => (
          <PitchSectionCard
            key={section}
            portfolioId={portfolio.id}
            section={section}
            items={pitchItems}
            currency={portfolio.valuationCurrency}
          />
        ))}

        {/* What has happened so far, dated — the record behind the claims */}
        <TractionSection
          portfolioId={portfolio.id}
          milestones={portfolio.milestones}
        />

        {/* Who else is in the market */}
        <PitchSectionCard
          portfolioId={portfolio.id}
          section="COMPETITION"
          items={pitchItems}
        />

        {/* Who is building it, dated — the latest lineup is the team today */}
        <TeamSection portfolio={portfolio} holders={holders} roles={roles} />

        {/* Contracts — repeatable related table */}
        <ContractsTable portfolio={portfolio} />

        {/* The split, versioned: who holds what as of each date, and the
          valuation that prices it */}
        <GrantsTable portfolio={portfolio} holders={holders} roles={roles} />

        {/* Periodic P&L and cash as reported by the startup */}
        <FinancialsTable
          portfolio={portfolio}
          currency={portfolio.valuationCurrency}
          metrics={metrics}
        />

        {/* Dated readings of whatever this project is measured on */}
        <PerformanceSection portfolio={portfolio} metrics={metrics} />

        {/* Deal-level dilution schedule. Tranches now live on the equity entries
          that use them, so this only appears for older portfolio-wide rows. */}
        {portfolio.tranches.length > 0 && (
          <TranchesTable
            portfolio={portfolio}
            currency={portfolio.valuationCurrency}
          />
        )}
      </div>
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
    <CollapsibleCard
      icon={FileSignature}
      title="Contracts"
      summary={
        portfolio.contracts.length > 0 ? portfolio.contracts.length : undefined
      }
      description="Every agreement behind this equity — founders agreement, MOA, amendments."
      forceOpen={adding || editingId !== null}
      actions={
        !adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add contract
          </button>
        )
      }
    >
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
              <ContractRow
                key={c.id}
                contract={c}
                index={idx + 1}
                currency={portfolio.valuationCurrency}
                busy={busy}
                onEdit={() => {
                  setEditingId(c.id);
                  setAdding(false);
                }}
                onDelete={() => handleDelete(c.id)}
              />
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
    </CollapsibleCard>
  );
}

/**
 * A contract at rest: what it's called and whether it's signed, with the term,
 * the fee and the paperwork behind the arrow.
 */
function ContractRow({
  contract: c,
  index,
  currency,
  busy,
  onEdit,
  onDelete,
}: {
  contract: EquityPortfolioDTO["contracts"][number];
  index: number;
  currency: string;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ongoing = isOngoing(c.lengthUnit);
  const start = c.startDate ? new Date(c.startDate).toLocaleDateString() : "—";
  const end = c.endDate ? new Date(c.endDate).toLocaleDateString() : "—";

  return (
    <RecordRow
      index={index}
      title={c.title || `Contract ${index}`}
      badges={
        <>
          <RecordBadge tone={c.signed ? "good" : "warn"}>
            {c.signed ? "Signed" : "Not signed"}
          </RecordBadge>
          {ongoing && (
            <RecordBadge tone="note">
              {EQUITY_LENGTH_UNIT.ONGOING}
            </RecordBadge>
          )}
        </>
      }
      meta={
        ongoing
          ? `${start} → no end date`
          : c.startDate || c.endDate
            ? `${start} → ${end}`
            : "No term set"
      }
      actions={
        <RowActions
          label="Contract options"
          disabled={busy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      }
    >
      <RecordDetails>
        <RecordDetail label="Start" value={start} />
        <RecordDetail label="End" value={ongoing ? "No end date" : end} />
        <RecordDetail
          label="Length"
          value={formatContractLength(c.lengthValue, c.lengthUnit) ?? "—"}
        />
        <RecordDetail
          label="Monthly fee"
          value={
            c.monthlyFee == null
              ? "—"
              : `${formatValuation(c.monthlyFee, currency)} · ${
                  FEE_STATUS[feeStatus(c)]
                }`
          }
        />
        {c.fileUrl && (
          <RecordDetail
            label="File"
            span
            value={
              <a
                href={c.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-0.5 px-2 py-1 rounded-md border border-border bg-muted/40 text-[11px] text-foreground no-underline hover:border-muted-foreground/40 transition-colors max-w-full"
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
            }
          />
        )}
        {c.notes && (
          <RecordDetail
            label="Notes"
            span
            value={
              <span className="whitespace-pre-wrap text-muted-foreground">
                {c.notes}
              </span>
            }
          />
        )}
      </RecordDetails>
    </RecordRow>
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
  const ongoing = isOngoing(draft.lengthUnit);
  const status = feeStatus({ endDate, lengthUnit: draft.lengthUnit });

  function set<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // The server drops both of these for an ongoing contract, so clear them here
  // too rather than let the form keep showing figures that won't be saved.
  function setLengthUnit(unit: string) {
    setDraft((d) =>
      isOngoing(unit)
        ? { ...d, lengthUnit: unit, lengthValue: "", monthlyFee: "" }
        : { ...d, lengthUnit: unit }
    );
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
            {!ongoing && (
              <input
                type="number"
                step="1"
                min="0"
                value={draft.lengthValue}
                onChange={(e) => set("lengthValue", e.target.value)}
                placeholder="e.g. 12"
                className={cn(inputCls, "flex-1 min-w-0")}
              />
            )}
            <select
              value={draft.lengthUnit}
              onChange={(e) => setLengthUnit(e.target.value)}
              className={cn(
                selectCls,
                ongoing ? "flex-1" : "w-[104px] shrink-0"
              )}
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
            {ongoing
              ? "No end date — we hold the tech indefinitely"
              : endDate
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
              placeholder={
                ongoing ? "Not charged on an ongoing contract" : "e.g. 1500"
              }
              disabled={ongoing}
              className={cn(
                inputCls,
                "flex-1 min-w-0",
                ongoing && "cursor-not-allowed opacity-50"
              )}
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
              status === "NONE" || !draft.monthlyFee
                ? "border-border bg-muted/30 text-muted-foreground"
                : status === "ACTUAL"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-sky-500/30 bg-sky-500/10 text-sky-400"
            )}
          >
            {status === "NONE"
              ? "No fee — the term never ends, so they never take over"
              : !draft.monthlyFee
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
          <GrowingTextarea
            value={draft.notes}
            onChange={(notes) => set("notes", notes)}
            placeholder="e.g. signed between Abdulaziz and the founders, not Nizek"
            className={cn(inputCls, "py-2")}
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

function contractLabel(
  contracts: EquityPortfolioDTO["contracts"],
  contractId: string | null
): string {
  if (!contractId) return "No contract linked";
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx === -1) return "Contract removed";
  return contracts[idx].title || `Contract ${idx + 1}`;
}

type EquitySetDTO = EquityPortfolioDTO["sets"][number];

/** yyyy-mm-dd, which is what a date input reads and writes. */
function dateInputValue(iso: string | Date): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatSetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The split, versioned. The newest one in effect is the live position and shows
 * in full; the ones before it are the history, collapsed until asked for. A new
 * split starts as a copy of the current one, since dilution restates a cap table
 * rather than replacing it outright.
 */
function GrantsTable({
  portfolio,
  holders,
  roles,
}: {
  portfolio: EquityPortfolioDTO;
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
}) {
  const router = useRouter();
  // Which split the form is open on: a set id when editing one, "new" when
  // recording one, null when the form is closed.
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = useMemo(() => currentSet(portfolio.sets), [portfolio.sets]);
  // Newest first, matching the order they arrive in.
  const earlier = portfolio.sets.filter((s) => s.id !== latest?.id);

  /**
   * The form, either editing `set` or — with null — recording a new split. A
   * new one opens as a copy of the current split dated today, since ownership
   * usually moves a line or two rather than starting over. Keyed so switching
   * between splits rebuilds the fields instead of reusing the last one's.
   */
  function renderSetForm(set: EquitySetDTO | null) {
    const source = set ?? latest;
    return (
      <GrantBatchForm
        key={set?.id ?? "new"}
        contracts={portfolio.contracts}
        holders={holders}
        roles={roles}
        currency={portfolio.valuationCurrency}
        initialContractId={source?.grants[0]?.contractId ?? ""}
        initialEffectiveOn={
          set ? dateInputValue(set.effectiveOn) : dateInputValue(new Date())
        }
        initialValuation={source?.valuation?.toLocaleString("en-US") ?? ""}
        initialRows={grantRowsFrom(source?.grants ?? [])}
        busy={busy}
        submitLabel={set ? "Save split" : "Add split"}
        onSubmit={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  /**
   * A saved split, read as one line: the date it took effect and what the
   * ownership became. Every split reads the same way and starts closed — the
   * current one is marked, not opened, so the section stays a list of dates.
   */
  function renderSavedSet(set: EquitySetDTO, current: boolean) {
    if (editing === set.id) {
      return (
        <div key={set.id} className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatSetDate(set.effectiveOn)}
          </span>
          {renderSetForm(set)}
        </div>
      );
    }

    return (
      <RecordRow
        key={set.id}
        title={formatSetDate(set.effectiveOn)}
        badges={current ? <RecordBadge tone="good">Current</RecordBadge> : null}
        meta={
          <>
            {formatPct(splitTotal(set.grants))} across {set.grants.length}
            {set.valuation != null && (
              <>
                {" · "}
                {formatValuation(set.valuation, portfolio.valuationCurrency)}
              </>
            )}
          </>
        }
        actions={
          editing === null && (
            <RowActions
              label="Split options"
              disabled={busy}
              onEdit={() => setEditing(set.id)}
              onDelete={() => handleDelete(set)}
            />
          )
        }
      >
        <GrantsView
          grants={set.grants}
          contracts={portfolio.contracts}
          currency={portfolio.valuationCurrency}
          currentValuation={set.valuation}
          total={splitTotal(set.grants)}
        />
      </RecordRow>
    );
  }

  async function handleSave({
    contractId,
    effectiveOn,
    valuation,
    rows,
  }: {
    contractId: string;
    effectiveOn: string;
    valuation: number | null;
    rows: GrantRowDraft[];
  }) {
    setBusy(true);
    try {
      const input = {
        effectiveOn,
        valuation,
        entries: rows.map((row) => ({
          contractId,
          holderId: row.holderId || null,
          roleId: row.roleId || null,
          structureType: row.structureType,
          equityPct:
            row.structureType === "TRANCHED"
              ? undefined
              : parseFloat(row.equityPct),
          // A tranche row is one milestone, so it saves as an entry holding a
          // single tranche — several milestones means several rows.
          tranches:
            row.structureType === "TRANCHED"
              ? [
                  {
                    equityPct: parseFloat(row.equityPct),
                    startsAtValuation: parseAmount(row.startsAtValuation),
                  },
                ]
              : undefined,
        })),
      };

      if (editing && editing !== "new") {
        await updateEquitySet(editing, input);
      } else {
        await addEquitySet(portfolio.id, input);
      }
      setEditing(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save equity");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(set: EquitySetDTO) {
    if (
      !confirm(
        `Delete the split effective ${formatSetDate(
          set.effectiveOn
        )}? This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      await deleteEquitySet(set.id);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      icon={PieChart}
      title="Equity"
      summary={
        latest
          ? `${formatPct(splitTotal(latest.grants))} across ${
              latest.grants.length
            }`
          : undefined
      }
      description="The whole split as of a date — ours and everyone else's, a row each, adding up to 100%. Fixed dilutes along with everyone; Protected is held back until the company reaches the valuation on the row, so a stake protected in stages takes a row per stage. Record a new split whenever the ownership changes: the first one is what we were granted, the latest is what we hold, and the gap between them is the dilution. Each entry vests monthly across the term of its contract; an ongoing contract has no term, so its stake is held in full from day one."
      forceOpen={editing !== null}
      actions={
        editing === null && (
          <button
            onClick={() => setEditing("new")}
            disabled={portfolio.contracts.length === 0}
            title={
              portfolio.contracts.length === 0
                ? "Add a contract first"
                : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {latest ? "New split" : "Add equity"}
          </button>
        )
      }
    >
      {portfolio.contracts.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          Add a contract above first — equity is always tied to one.
        </p>
      ) : latest || editing !== null ? (
        <div className="space-y-1.5">
          {/* A new split sits above the one it supersedes, so you can read the
              figures you're changing while you type the new ones. */}
          {editing === "new" && <div className="mb-3">{renderSetForm(null)}</div>}

          {/* Superseded splits follow the current one, closed. They're the
              history of the ownership, and they read like every other record. */}
          {latest && renderSavedSet(latest, true)}
          {earlier.map((set) => renderSavedSet(set, false))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground py-2">
          No equity defined yet.
        </p>
      )}
    </CollapsibleCard>
  );
}

/** A saved cell — shaped like the field it mirrors, minus the ability to type. */
const readCellCls =
  "h-9 px-3 rounded-lg border border-border bg-muted/30 flex items-center text-[13px] text-foreground";

// Tracks the form's columns so a saved row lands where it was typed.
const GRANT_VIEW_GRID =
  "grid-cols-1 sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10.5rem]";

/**
 * The saved split, laid out exactly as the form that wrote it so the numbers
 * sit where you typed them. Editing is all-or-nothing from the section header,
 * so nothing here is interactive.
 */
function GrantsView({
  grants,
  contracts,
  currency,
  currentValuation,
  total,
}: {
  grants: EquitySetDTO["grants"];
  contracts: EquityPortfolioDTO["contracts"];
  currency: string;
  currentValuation: number | null;
  total: number;
}) {
  const tranches = grants.flatMap((g) => g.tranches);
  const split = splitTranchesByDilution(tranches, currentValuation);

  // The form grants everything under one contract, but older entries predate
  // that rule, so say so rather than naming the wrong one.
  const shared = grants.every((g) => g.contractId === grants[0].contractId);

  return (
    <div className="rounded-lg border border-border bg-card p-3.5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <label className={labelCls}>Contract</label>
          <div className={readCellCls}>
            {shared
              ? contractLabel(contracts, grants[0].contractId)
              : "Multiple contracts"}
          </div>
        </div>
        <div>
          <label className={labelCls}>Valuation</label>
          <div className={cn(readCellCls, "justify-between gap-1")}>
            {currentValuation == null ? (
              <span className="text-muted-foreground">Not valued yet</span>
            ) : (
              <>
                <span className="tabular-nums truncate">
                  {currentValuation.toLocaleString("en-US")}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {currency}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-6">
        <div className={cn("hidden sm:grid gap-2 px-0.5", GRANT_VIEW_GRID)}>
          <span className={cn(labelCls, "mb-0")}>Equity %</span>
          <span className={cn(labelCls, "mb-0")}>Type</span>
          <span className={cn(labelCls, "mb-0")}>Name</span>
          <span className={cn(labelCls, "mb-0")}>Role</span>
          <span className={cn(labelCls, "mb-0")}>Dilutes at</span>
        </div>

        {grants.map((g) => {
          const milestone = g.tranches[0];
          const diluted =
            milestone != null &&
            isTrancheDiluted(milestone.startsAtValuation, currentValuation);

          return (
            <div key={g.id} className="space-y-1">
              <div className={cn("grid gap-2 items-center", GRANT_VIEW_GRID)}>
                <div className={cn(readCellCls, "justify-between")}>
                  <span className="tabular-nums">
                    {Math.round(g.equityPct * 1000) / 1000}
                  </span>
                  <span className="text-muted-foreground">%</span>
                </div>
                <div className={readCellCls}>
                  <span className="truncate">
                    {equityLabel(EQUITY_STRUCTURE, g.structureType)}
                  </span>
                </div>
                <div className={readCellCls}>
                  <span
                    className={cn(
                      "truncate",
                      !g.holder && "text-muted-foreground"
                    )}
                  >
                    {g.holder?.name ?? "No name"}
                  </span>
                </div>
                <div className={readCellCls}>
                  <span
                    className={cn(
                      "truncate",
                      !g.role && "text-muted-foreground"
                    )}
                  >
                    {g.role?.name ?? "No role"}
                  </span>
                </div>
                {milestone ? (
                  <div
                    className={cn(readCellCls, "justify-between gap-1")}
                    title={
                      currentValuation == null
                        ? undefined
                        : diluted
                        ? "Already diluting"
                        : "Not diluted yet"
                    }
                  >
                    <span
                      className={cn(
                        "tabular-nums truncate",
                        currentValuation != null &&
                          (diluted ? "text-amber-400" : "text-emerald-400")
                      )}
                    >
                      {milestone.startsAtValuation.toLocaleString("en-US")}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {currency}
                    </span>
                  </div>
                ) : (
                  <span className="hidden sm:block text-[12px] text-muted-foreground/30 text-center">
                    —
                  </span>
                )}
              </div>

              {g.notes && (
                <p className="text-[11px] text-muted-foreground/70 sm:pl-1 whitespace-pre-wrap">
                  {g.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 border-t border-border pt-3">
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Total{" "}
          <span
            className={cn(
              "font-medium",
              Math.abs(total - 100) < 0.001 ? "text-primary" : "text-amber-400"
            )}
          >
            {formatPct(total)}
          </span>
        </p>
        {currentValuation != null && tranches.length > 0 && (
          <p className="text-[11px] text-muted-foreground tabular-nums">
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
    </div>
  );
}

type GrantRowDraft = {
  /** Stable across edits so typing in one row doesn't remount its siblings. */
  key: string;
  holderId: string;
  roleId: string;
  structureType: string;
  equityPct: string;
  /** Only a protected row uses this — the valuation its stake dilutes at. */
  startsAtValuation: string;
};

let grantRowSeq = 0;

function emptyGrantRow(): GrantRowDraft {
  grantRowSeq += 1;
  return {
    key: `row-${grantRowSeq}`,
    holderId: "",
    roleId: "",
    structureType: "FIXED",
    equityPct: "",
    startsAtValuation: "",
  };
}

function grantRowPct(row: GrantRowDraft): number {
  const pct = parseFloat(row.equityPct);
  return Number.isNaN(pct) ? 0 : pct;
}

function grantRowComplete(row: GrantRowDraft): boolean {
  if (!row.holderId) return false;
  if (grantRowPct(row) <= 0) return false;
  // A tranche is only meaningful once you say what valuation it dilutes at.
  if (row.structureType === "TRANCHED") {
    return !Number.isNaN(parseAmount(row.startsAtValuation));
  }
  return true;
}

const GRANT_ROW_GRID =
  "grid-cols-1 sm:grid-cols-[1rem_5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10.5rem_1.75rem]";

/** One row of the split, draggable by its handle so the order can be arranged. */
function SortableGrantRow({
  row,
  holders,
  roles,
  currency,
  canRemove,
  onChange,
  onRemove,
}: {
  row: GrantRowDraft;
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
  currency: string;
  canRemove: boolean;
  onChange: (patch: Partial<GrantRowDraft>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.key });
  const tranched = row.structureType === "TRANCHED";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid gap-2 items-center",
        GRANT_ROW_GRID,
        isDragging && "relative z-10 opacity-60"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="hidden sm:flex w-4 h-9 items-center justify-center text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      <PercentInput
        value={row.equityPct}
        onChange={(v) => onChange({ equityPct: v })}
        placeholder="0"
      />
      <select
        value={row.structureType}
        onChange={(e) => onChange({ structureType: e.target.value })}
        className={selectCls}
      >
        {Object.entries(EQUITY_STRUCTURE).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select
        value={row.holderId}
        onChange={(e) => onChange({ holderId: e.target.value })}
        className={selectCls}
      >
        <option value="">Select name…</option>
        {holders.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <select
        value={row.roleId}
        onChange={(e) => onChange({ roleId: e.target.value })}
        className={selectCls}
      >
        <option value="">No role</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {tranched ? (
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={row.startsAtValuation}
            onChange={(e) =>
              onChange({ startsAtValuation: sanitizeAmount(e.target.value) })
            }
            placeholder="Valuation"
            title={`The stake is non-diluted until the company reaches this valuation (${currency})`}
            className={cn(inputCls, "pr-11 text-[12px]")}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
            {currency}
          </span>
        </div>
      ) : (
        <span className="hidden sm:block text-[12px] text-muted-foreground/30 text-center">
          —
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title="Remove row"
        className="w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * Turns existing entries back into rows. A tranche is a row of its own, so a
 * legacy entry carrying several comes back as several rows rather than losing
 * all but the first when it's saved again.
 */
function grantRowsFrom(grants: EquitySetDTO["grants"]): GrantRowDraft[] {
  return grants.flatMap((g) => {
    const shared = {
      holderId: g.holderId ?? "",
      roleId: g.roleId ?? "",
      structureType: g.structureType,
    };
    if (g.structureType === "TRANCHED" && g.tranches.length > 0) {
      return g.tranches.map((t) => ({
        ...emptyGrantRow(),
        ...shared,
        equityPct: t.equityPct.toString(),
        startsAtValuation: t.startsAtValuation.toLocaleString("en-US"),
      }));
    }
    return [
      {
        ...emptyGrantRow(),
        ...shared,
        equityPct: g.equityPct.toString(),
      },
    ];
  });
}

/**
 * The whole split on one screen — our slice next to everyone else's, all under
 * one contract. It submits the finished picture, so removing a row here removes
 * the entry. It won't save until the rows land on 100%, since a cap table that
 * doesn't add up is the thing this screen exists to prevent.
 */
function GrantBatchForm({
  contracts,
  holders,
  roles,
  currency,
  initialContractId,
  initialEffectiveOn,
  initialValuation,
  initialRows,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  contracts: EquityPortfolioDTO["contracts"];
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
  currency: string;
  initialContractId: string;
  initialEffectiveOn: string;
  initialValuation: string;
  initialRows: GrantRowDraft[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: {
    contractId: string;
    effectiveOn: string;
    valuation: number | null;
    rows: GrantRowDraft[];
  }) => void;
  onCancel: () => void;
}) {
  const [contractId, setContractId] = useState(initialContractId);
  const [effectiveOn, setEffectiveOn] = useState(initialEffectiveOn);
  const [valuation, setValuation] = useState(initialValuation);
  const [rows, setRows] = useState<GrantRowDraft[]>(() =>
    initialRows.length > 0 ? initialRows : [emptyGrantRow()]
  );

  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function update(key: string, patch: Partial<GrantRowDraft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setRows((rs) => {
      const from = rs.findIndex((r) => r.key === active.id);
      const to = rs.findIndex((r) => r.key === over.id);
      if (from === -1 || to === -1) return rs;
      return arrayMove(rs, from, to);
    });
  }

  const total = rows.reduce((sum, r) => sum + grantRowPct(r), 0);
  const remaining = 100 - total;
  // Stakes carry three decimals, so a hand-typed split rarely sums exactly.
  const balanced = Math.abs(remaining) < 0.001;
  const rowsComplete = rows.every(grantRowComplete);
  const valid =
    !!contractId &&
    !!effectiveOn &&
    rows.length > 0 &&
    rowsComplete &&
    balanced;

  // Spelled out under the totals rather than left in a tooltip — a Save button
  // that greys out for no visible reason is the same as a broken one.
  const missingHint = !contractId
    ? "Pick the contract this equity is granted under."
    : !effectiveOn
    ? "Set the date this split takes effect."
    : !rowsComplete
    ? "Every row needs a name and an equity % above 0, and tranche rows need a valuation."
    : undefined;

  const blockedReason =
    missingHint ??
    (balanced
      ? undefined
      : `Everything has to add up to 100% — it's at ${formatPct(total)}`);

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3.5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_14rem]">
        <div>
          <label className={labelCls}>Contract</label>
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
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
          <p className="text-[11px] text-muted-foreground mt-1">
            Every row below is granted under this contract.
          </p>
        </div>
        <div>
          <label className={labelCls}>Effective</label>
          <input
            type="date"
            value={effectiveOn}
            onChange={(e) => setEffectiveOn(e.target.value)}
            className={inputCls}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            When it took effect.
          </p>
        </div>
        <div>
          <label className={labelCls}>Valuation</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={valuation}
              onChange={(e) => setValuation(sanitizeAmount(e.target.value))}
              placeholder="Not valued yet"
              className={cn(inputCls, "pr-11")}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
              {currency}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            What the company is worth today.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-6">
        <div className={cn("hidden sm:grid gap-2 px-0.5", GRANT_ROW_GRID)}>
          <span />
          <span className={cn(labelCls, "mb-0")}>Equity %</span>
          <span className={cn(labelCls, "mb-0")}>Type</span>
          <span className={cn(labelCls, "mb-0")}>Name</span>
          <span className={cn(labelCls, "mb-0")}>Role</span>
          <span className={cn(labelCls, "mb-0")}>Dilutes at</span>
          <span />
        </div>

        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rows.map((row) => (
                <SortableGrantRow
                  key={row.key}
                  row={row}
                  holders={holders}
                  roles={roles}
                  currency={currency}
                  canRemove={rows.length > 1}
                  onChange={(patch) => update(row.key, patch)}
                  onRemove={() =>
                    setRows((rs) => rs.filter((r) => r.key !== row.key))
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, emptyGrantRow()])}
          className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add row
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 border-t border-border pt-3">
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Total{" "}
          <span
            className={cn(
              "font-medium",
              balanced ? "text-primary" : "text-amber-400"
            )}
          >
            {formatPct(total)}
          </span>
          {!balanced && (
            <span className="text-amber-400">
              {" "}
              —{" "}
              {remaining > 0
                ? `${formatPct(remaining)} left to allocate`
                : `${formatPct(-remaining)} over`}
            </span>
          )}
        </p>
        {missingHint && (
          <p className="order-last basis-full text-[11px] text-amber-400">
            {missingHint}
          </p>
        )}
        <div className="flex items-center gap-2">
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
            onClick={() => {
              const amount = parseAmount(valuation);
              onSubmit({
                contractId,
                effectiveOn,
                valuation: Number.isNaN(amount) ? null : amount,
                rows,
              });
            }}
            disabled={busy || !valid}
            title={blockedReason}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Digits, thousands separators and one decimal point — "2,000,000" pastes in fine. */
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
}

function parseAmount(raw: string | null | undefined): number {
  return parseFloat((raw ?? "").replace(/,/g, ""));
}

/**
 * One line of a report being written: a field and whichever value box its type
 * calls for. The key survives reordering and a change of field, which an index
 * wouldn't.
 */
type FieldRow = { key: string; metricId: string; number: string; date: string };

type FinancialReportDraft = {
  periodType: string;
  year: string;
  quarter: string;
  audited: boolean;
  rows: FieldRow[];
  needsHelp: boolean;
  helpNotes: string;
};

let financialRowSeq = 0;
function blankFieldRow(): FieldRow {
  financialRowSeq += 1;
  return { key: `fin-${financialRowSeq}`, metricId: "", number: "", date: "" };
}

/**
 * Built fresh per open, so the period defaults to the quarter you're actually
 * in and the lines are whatever this project has to report. A required field
 * arrives as a line of its own: it isn't something to remember to add, it's the
 * form.
 */
function emptyFinancialReport(fields: ReportField[]): FinancialReportDraft {
  const now = new Date();
  const required = fields.filter((f) => f.required);
  return {
    periodType: "QUARTERLY",
    year: String(now.getUTCFullYear()),
    quarter: String(quarterOf(now)),
    audited: false,
    rows:
      required.length > 0
        ? required.map((f) => ({ ...blankFieldRow(), metricId: f.metric.id }))
        : [blankFieldRow()],
    needsHelp: false,
    helpNotes: "",
  };
}

/**
 * An existing period opened for editing. Required fields it was filed without
 * are added as empty lines rather than left off: the rule may have arrived
 * after the period did, and a gap is easier to fill than to notice.
 */
function reportToDraft(
  r: EquityPortfolioDTO["financialReports"][number],
  fields: ReportField[]
): FinancialReportDraft {
  const reported = r.values.map((v) => ({
    ...blankFieldRow(),
    metricId: v.metricId,
    number: v.numberValue?.toLocaleString("en-US") ?? "",
    date: v.dateValue?.slice(0, 10) ?? "",
  }));
  const filed = new Set(r.values.map((v) => v.metricId));
  const missing = fields
    .filter((f) => f.required && !filed.has(f.metric.id))
    .map((f) => ({ ...blankFieldRow(), metricId: f.metric.id }));

  const rows = [...reported, ...missing];
  return {
    periodType: r.periodType,
    year: String(new Date(r.periodStart).getUTCFullYear()),
    quarter: String(quarterOf(r.periodStart)),
    audited: r.audited,
    rows: rows.length > 0 ? rows : [blankFieldRow()],
    needsHelp: r.needsHelp,
    helpNotes: r.helpNotes ?? "",
  };
}

/** Blank means "not reported", which is distinct from zero. */
function optionalAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  const parsed = parseAmount(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Every field the registry offers a financial report, asked for or not. */
function financialFields(metrics: EquityMetricDTO[]) {
  return metrics.filter((m) => m.group === "FINANCIAL");
}

/** One field this project's reports ask for, and whether they insist on it. */
type ReportField = { metric: EquityMetricDTO; required: boolean };

/**
 * The questionnaire: the registry's fields narrowed to the ones this project
 * reports, in the order it asks for them.
 *
 * A row pointing at a field that has since left the registry is dropped rather
 * than shown as a blank line — the database cascades those away, so this only
 * covers the moment between a deletion and a refresh.
 */
function projectFields(
  metrics: EquityMetricDTO[],
  reportFields: EquityPortfolioDTO["reportFields"]
): ReportField[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  return reportFields.flatMap((f) => {
    const metric = byId.get(f.metricId);
    return metric ? [{ metric, required: f.required }] : [];
  });
}

/**
 * One report read back field by field: what was entered, plus what the
 * calculated fields work out to from it. Calculations are done here rather than
 * stored, so a corrected figure corrects everything standing on it.
 *
 * Figures reported against a field the project no longer asks for are listed
 * after the rest. Dropping a question doesn't unmake the answers given to it,
 * and a period that reported something should still say so.
 */
function readFinancialFields(
  fields: ReportField[],
  values: EquityPortfolioDTO["financialReports"][number]["values"]
) {
  const stored = new Map(values.map((v) => [v.metricId, v]));
  const numbers = new Map(values.map((v) => [v.metricId, v.numberValue]));

  const asked = fields.map(({ metric }) => {
    if (isFormulaMetric(metric.type)) {
      const worked = evaluateFormula(
        metric.formulaOp,
        numbers.get(metric.leftId ?? "") ?? null,
        numbers.get(metric.rightId ?? "") ?? null
      );
      return {
        metric,
        reported: worked != null,
        display: formatMetricValue(metric, { numberValue: worked }),
      };
    }
    const value = stored.get(metric.id);
    const reported =
      value != null && (value.numberValue != null || value.dateValue != null);
    return {
      metric,
      reported,
      display: value ? formatMetricValue(metric, value) : "—",
    };
  });

  const onList = new Set(fields.map((f) => f.metric.id));
  const dropped = values
    .filter((v) => !onList.has(v.metricId))
    .map((v) => ({
      metric: v.metric,
      reported: v.numberValue != null || v.dateValue != null,
      display: formatMetricValue(v.metric, v),
    }));

  return [...asked, ...dropped];
}

/**
 * The period to read across from while filling one in: the one before it, or
 * the one after when nothing came before.
 *
 * Whoever is entering a quarter wants to know what the last one said — a figure
 * that halved is worth a second look before it's saved, and a balance that
 * didn't move at all is usually a copied number rather than a real one. Filing
 * a quarter older than everything on record is the case for looking forward
 * instead: there's still a neighbour to read against, it's just on the other
 * side.
 */
function neighbouringReport(
  reports: EquityPortfolioDTO["financialReports"],
  periodStart: string | null
) {
  if (!periodStart) return null;
  const at = new Date(periodStart).getTime();
  if (Number.isNaN(at)) return null;

  const older = reports.filter((r) => new Date(r.periodStart).getTime() < at);
  const newer = reports.filter((r) => new Date(r.periodStart).getTime() > at);
  // Reports arrive newest first, so the nearest earlier one leads the first
  // list and the nearest later one closes the second.
  return older[0] ?? newer[newer.length - 1] ?? null;
}

/** What one period reported, by field, ready to read off beside a form. */
function reportedValues(
  report: EquityPortfolioDTO["financialReports"][number] | null
) {
  return new Map(
    (report?.values ?? []).map((v) => [v.metricId, v] as const)
  );
}

function financialReportPayload(draft: FinancialReportDraft) {
  return {
    periodType: draft.periodType,
    periodStart: periodStartFor(
      parseInt(draft.year, 10),
      draft.periodType === "YEARLY" ? null : parseInt(draft.quarter, 10)
    ),
    audited: draft.audited,
    needsHelp: draft.needsHelp,
    helpNotes: draft.helpNotes.trim() || null,
    // Lines without a field picked are dropped rather than rejected — the form
    // starts every new one empty, and an untouched line isn't an error.
    values: draft.rows
      .filter((row) => row.metricId)
      .map((row) => ({
        metricId: row.metricId,
        numberValue: optionalAmount(row.number),
        dateValue: row.date || null,
      })),
  };
}

function FinancialsTable({
  portfolio,
  currency,
  metrics,
}: {
  portfolio: EquityPortfolioDTO;
  currency: string;
  metrics: EquityMetricDTO[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const reports = portfolio.financialReports;
  const fields = projectFields(metrics, portfolio.reportFields);
  const requiredCount = fields.filter((f) => f.required).length;
  const pendingDelete = reports.find((r) => r.id === deletingId) ?? null;

  async function handleAdd(draft: FinancialReportDraft) {
    setBusy(true);
    try {
      await addEquityFinancialReport(
        portfolio.id,
        financialReportPayload(draft)
      );
      setAdding(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add report");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(reportId: string, draft: FinancialReportDraft) {
    setBusy(true);
    try {
      await updateEquityFinancialReport(
        reportId,
        financialReportPayload(draft)
      );
      setEditingId(null);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save report");
    } finally {
      setBusy(false);
    }
  }

  // Errors are left to the dialog, which keeps them beside the box that has to
  // be corrected instead of in an alert that closes over it.
  async function handleDelete(reportId: string, typed: string) {
    await deleteEquityFinancialReport(reportId, typed);
    router.refresh();
  }

  async function handleFields(next: ReportFieldChoice[]) {
    setBusy(true);
    try {
      await setEquityReportFields(portfolio.id, next);
      setPicking(false);
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to save fields");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      icon={BarChart3}
      title="Financials"
      summary={reports.length > 0 ? reports.length : undefined}
      description={`What the startup reported for a quarter or a year. Which figures this project reports is set below${
        requiredCount > 0
          ? `, and ${requiredCount} of them can't be left off a new period`
          : ""
      }. A calculated field is worked out from the figures rather than entered.`}
      forceOpen={adding || picking || editingId !== null}
      actions={
        !adding && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setPicking((p) => !p);
                setAdding(false);
                setEditingId(null);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors",
                picking
                  ? "border-primary/40 text-foreground bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Figures
            </button>
            {fields.length > 0 && (
              <button
                onClick={() => {
                  setAdding(true);
                  setPicking(false);
                  setEditingId(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add report
              </button>
            )}
          </div>
        )
      }
    >
      {picking && (
        <ReportFieldPicker
          all={financialFields(metrics)}
          chosen={portfolio.reportFields}
          busy={busy}
          onSubmit={handleFields}
          onCancel={() => setPicking(false)}
        />
      )}

      {fields.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-2">
          {financialFields(metrics).length === 0 ? (
            <>
              Nothing to report on yet — define what a period is reported with
              under{" "}
              <Link
                href="/dashboard/equity"
                className="text-primary hover:underline"
              >
                Financials data
              </Link>{" "}
              first.
            </>
          ) : (
            <>
              This project isn&apos;t asked for any figures yet — choose them
              under Figures above.
            </>
          )}
        </p>
      ) : (
        <>
          {reports.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {reports.map((r) =>
                editingId === r.id ? (
                  <FinancialReportForm
                    key={r.id}
                    initial={reportToDraft(r, fields)}
                    currency={currency}
                    metrics={metrics}
                    fields={fields}
                    // Itself excluded: a period is no reference for itself.
                    others={reports.filter((other) => other.id !== r.id)}
                    // Editing a period filed before the rule arrived says so
                    // rather than refusing to save it.
                    enforceRequired={false}
                    busy={busy}
                    submitLabel="Save"
                    onSubmit={(draft) => handleUpdate(r.id, draft)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <FinancialReportRow
                    key={r.id}
                    report={r}
                    fields={fields}
                    busy={busy}
                    onEdit={() => {
                      setEditingId(r.id);
                      setAdding(false);
                    }}
                    onDelete={() => setDeletingId(r.id)}
                  />
                )
              )}
            </div>
          )}

          {adding && (
            <FinancialReportForm
              initial={emptyFinancialReport(fields)}
              currency={currency}
              metrics={metrics}
              fields={fields}
              others={reports}
              enforceRequired
              busy={busy}
              submitLabel="Add report"
              onSubmit={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}

          {reports.length === 0 && !adding && (
            <p className="text-[12px] text-muted-foreground py-2">
              No financial reports yet.
            </p>
          )}

          {pendingDelete && (
            <ConfirmDeleteDialog
              key={pendingDelete.id}
              open
              onOpenChange={(open) => !open && setDeletingId(null)}
              title={`Delete ${formatPeriodLabel(
                pendingDelete.periodType,
                pendingDelete.periodStart
              )}?`}
              description="This removes the period and every figure reported for it. Unlike a portfolio, a report doesn't go to the trash — it's gone, and the figures have to be asked for again."
              confirmWord={portfolio.project.name}
              confirmLabel="Delete report"
              onConfirm={(typed) => handleDelete(pendingDelete.id, typed)}
            />
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

function FinancialReportRow({
  report: r,
  fields: asked,
  busy,
  onEdit,
  onDelete,
}: {
  report: EquityPortfolioDTO["financialReports"][number];
  fields: ReportField[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fields = readFinancialFields(asked, r.values);
  // The first two fields that were actually reported stand for the period on
  // the closed row; which two they are is whatever this project asks for first.
  const headline = fields.filter((f) => f.reported).slice(0, 2);

  return (
    <RecordRow
      title={formatPeriodLabel(r.periodType, r.periodStart)}
      badges={
        <>
          <RecordBadge tone={r.audited ? "good" : "neutral"}>
            {r.audited ? "Audited" : "Unaudited"}
          </RecordBadge>
          {r.needsHelp && <RecordBadge tone="warn">Needs help</RecordBadge>}
        </>
      }
      meta={
        headline.length > 0
          ? headline
              .map((f) => `${f.display} ${f.metric.name.toLowerCase()}`)
              .join(" · ")
          : "Nothing reported"
      }
      actions={
        <RowActions
          label="Report options"
          disabled={busy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      }
    >
      <RecordDetails>
        {fields.map((f) => (
          <RecordDetail
            key={f.metric.id}
            label={f.metric.name}
            value={f.display}
          />
        ))}
        {r.needsHelp && r.helpNotes && (
          <RecordDetail
            label="Help"
            span
            value={
              <span className="whitespace-pre-wrap text-muted-foreground">
                {r.helpNotes}
              </span>
            }
          />
        )}
      </RecordDetails>
    </RecordRow>
  );
}

type ReportFieldChoice = { metricId: string; required: boolean };

/**
 * Which of the registry's financial fields this project is asked for, and which
 * of them a new period can't be filed without.
 *
 * Three states per field rather than two checkboxes: not asked, asked, and
 * required. They're one choice — a field can't be required without being asked
 * — so they read as one control instead of two that have to agree.
 */
function ReportFieldPicker({
  all,
  chosen,
  busy,
  onSubmit,
  onCancel,
}: {
  all: EquityMetricDTO[];
  chosen: EquityPortfolioDTO["reportFields"];
  busy: boolean;
  onSubmit: (fields: ReportFieldChoice[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Map<string, boolean>>(
    () => new Map(chosen.map((f) => [f.metricId, f.required]))
  );

  function setState(metricId: string, state: "off" | "asked" | "required") {
    setDraft((d) => {
      const next = new Map(d);
      if (state === "off") next.delete(metricId);
      else next.set(metricId, state === "required");
      return next;
    });
  }

  const asked = all.filter((m) => draft.has(m.id));
  // A calculation only comes out if both the figures under it are reported, so
  // the form says which ones those are rather than leaving it to be discovered
  // on a chart with a hole in it.
  const starved = asked.filter((m) => {
    if (!isFormulaMetric(m.type)) return false;
    return !draft.has(m.leftId ?? "") || !draft.has(m.rightId ?? "");
  });

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3 mb-3">
      <div>
        <h4 className="text-[13px] font-semibold text-foreground">
          Figures this project reports
        </h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          The fields come from{" "}
          <Link
            href="/dashboard/equity"
            className="text-primary hover:underline"
          >
            Financials data
          </Link>
          ; what a given project is asked for is set here. Required means a new
          period can&apos;t be filed without it — 0 is an answer, blank
          isn&apos;t.
        </p>
      </div>

      <div className="space-y-1.5">
        {all.map((metric) => {
          const required = draft.get(metric.id);
          const state =
            required === undefined ? "off" : required ? "required" : "asked";
          const formula = isFormulaMetric(metric.type);
          return (
            <div
              key={metric.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 h-10"
            >
              <span className="text-[13px] text-foreground truncate flex-1 min-w-0">
                {metric.name}
                {formula && (
                  <span className="text-[11px] text-muted-foreground ml-1.5">
                    calculated
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {(["off", "asked", "required"] as const).map((option) => {
                  // Nothing to leave blank on a calculated field, so there's
                  // nothing to insist on either.
                  if (option === "required" && formula) return null;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setState(metric.id, option)}
                      className={cn(
                        "px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors",
                        state === option
                          ? option === "off"
                            ? "bg-muted text-foreground"
                            : "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      {option === "off"
                        ? "Not asked"
                        : option === "asked"
                          ? "Optional"
                          : "Required"}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {starved.length > 0 && (
        <p className="text-[11px] text-amber-400">
          {starved.map((m) => m.name).join(", ")}{" "}
          {starved.length === 1 ? "needs a figure" : "need figures"} this
          project isn&apos;t asked for, so{" "}
          {starved.length === 1 ? "it" : "they"} will come out blank.
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-muted-foreground mr-auto">
          Taking a field off keeps what was already reported for it.
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit(
              all
                .filter((m) => draft.has(m.id))
                .map((m) => ({ metricId: m.id, required: !!draft.get(m.id) }))
            )
          }
          disabled={busy}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save fields"}
        </button>
      </div>
    </div>
  );
}

/**
 * The year as a list to pick from that can also be typed into.
 *
 * A datalist rather than a select, because the years offered are a guess — the
 * decade around today, plus whatever has already been reported — and a report
 * for a year outside that guess should still be possible to file. Typing
 * narrows the list, so a long span of years is no harder to use than a short
 * one.
 */
function YearPicker({
  value,
  years,
  onChange,
}: {
  value: string;
  years: number[];
  onChange: (year: string) => void;
}) {
  const listId = useId();

  return (
    <div className="w-[104px] shrink-0">
      <input
        type="text"
        inputMode="numeric"
        list={listId}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 4))
        }
        placeholder="Year"
        // The arrow is the browser's own, and drawn differently by each of
        // them. Left alone deliberately: a second one painted over the top is
        // what two arrows in the same box look like, and only the native one
        // actually opens the list everywhere.
        className={cn(
          inputCls,
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
          "[&::-webkit-list-button]:cursor-pointer"
        )}
      />
      <datalist id={listId}>
        {years.map((year) => (
          <option key={year} value={year} />
        ))}
      </datalist>
    </div>
  );
}

/** Read-only box for a figure the form works out rather than accepts. */
function DerivedField({
  label,
  value,
  previously,
}: {
  label: string;
  value: string;
  /** What the neighbouring period worked out to, where there is one. */
  previously?: string | null;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 text-[13px] text-foreground tabular-nums">
        <span className="truncate">{value}</span>
        {previously && (
          <span className="ml-auto text-[11px] text-muted-foreground truncate">
            {previously}
          </span>
        )}
      </div>
    </div>
  );
}

function FinancialReportForm({
  initial,
  currency,
  metrics,
  fields: asked,
  others,
  enforceRequired,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FinancialReportDraft;
  currency: string;
  /** The whole registry, for naming the fields a calculation stands on. */
  metrics: EquityMetricDTO[];
  /** What this project reports, which is what the form asks for. */
  fields: ReportField[];
  /** Every other period on record, to read the neighbouring one across from. */
  others: EquityPortfolioDTO["financialReports"];
  /** Off when editing: a rule made today doesn't reach back into last year. */
  enforceRequired: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: FinancialReportDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FinancialReportDraft>(initial);

  function set<K extends keyof FinancialReportDraft>(
    key: K,
    value: FinancialReportDraft[K]
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function patchRow(key: string, patch: Partial<FieldRow>) {
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  // A calculated field can't be reported — it's read from the ones that can.
  const enterable = asked
    .filter((f) => !isFormulaMetric(f.metric.type))
    .map((f) => f.metric);
  const calculated = asked
    .filter((f) => isFormulaMetric(f.metric.type))
    .map((f) => f.metric);

  const requiredIds = new Set(
    asked.filter((f) => f.required).map((f) => f.metric.id)
  );
  // A required field already has a line of its own, so offering it again would
  // only make a duplicate to reject.
  const pickable = enterable.filter((m) => !requiredIds.has(m.id));

  const filled = draft.rows.filter((r) => r.metricId);
  const duplicate = new Set(filled.map((r) => r.metricId)).size !== filled.length;

  // Worked out as you type, so a figure can be checked against what it feeds
  // before the period is saved.
  const entered = new Map(
    filled.map((row) => [row.metricId, optionalAmount(row.number)])
  );

  /** A required field with nothing in its box. Zero counts as an answer. */
  const missing = asked.filter(({ metric, required }) => {
    if (!required) return false;
    const row = draft.rows.find((r) => r.metricId === metric.id);
    return !isFieldAnswered(metric, {
      numberValue: row ? optionalAmount(row.number) : null,
      dateValue: row?.date || null,
    });
  });
  const missingNames = missing.map((f) => f.metric.name).join(", ");

  const year = parseInt(draft.year, 10);
  const validYear = Number.isFinite(year) && year > 1900 && year < 3000;

  // Next year through the last ten, plus every year already on record and the
  // one being edited, so the list covers the likely answers without ruling out
  // an unlikely one.
  const yearOptions = (() => {
    const now = new Date().getUTCFullYear();
    const years = new Set<number>();
    for (let y = now + 1; y >= now - 10; y--) years.add(y);
    for (const report of others) {
      years.add(new Date(report.periodStart).getUTCFullYear());
    }
    if (validYear) years.add(year);
    return [...years].sort((a, b) => b - a);
  })();

  // What the period next to this one said, to fill this one in against.
  const neighbour = neighbouringReport(
    others,
    validYear
      ? periodStartFor(
          year,
          draft.periodType === "YEARLY" ? null : parseInt(draft.quarter, 10)
        )
      : null
  );
  const before = reportedValues(neighbour);
  const beforeNumbers = new Map(
    [...before].map(([id, value]) => [id, value.numberValue])
  );
  const beforeLabel = neighbour
    ? formatPeriodLabel(neighbour.periodType, neighbour.periodStart)
    : null;
  // The neighbour's column only exists when there's a neighbour, and only where
  // there's room for it, so the lines and their header have to agree on the
  // shape from one place.
  const rowGrid = beforeLabel
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,120px)_auto]"
    : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]";

  const blocked = !validYear
    ? "Enter the year this period belongs to"
    : enforceRequired && missing.length > 0
      ? `${missingNames} ${missing.length === 1 ? "is" : "are"} required`
      : filled.length === 0
        ? "Add at least one figure"
        : duplicate
          ? "A field can only be reported once per period"
          : null;

  // Said rather than enforced on an existing period: the figures were reported
  // before the field was, and there may be nobody left to ask.
  const warning =
    !enforceRequired && missing.length > 0
      ? `${missingNames} ${
          missing.length === 1 ? "is" : "are"
        } required on new reports and still empty here`
      : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div>
          <label className={labelCls}>Reporting period</label>
          <div className="flex items-center gap-2">
            <select
              value={draft.periodType}
              onChange={(e) => set("periodType", e.target.value)}
              className={cn(selectCls, "flex-1 min-w-0")}
            >
              {Object.entries(EQUITY_PERIOD_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {draft.periodType === "QUARTERLY" && (
              <select
                value={draft.quarter}
                onChange={(e) => set("quarter", e.target.value)}
                className={cn(selectCls, "w-[84px] shrink-0")}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            )}
            <YearPicker
              value={draft.year}
              years={yearOptions}
              onChange={(next) => set("year", next)}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Audited</label>
          <select
            value={draft.audited ? "yes" : "no"}
            onChange={(e) => set("audited", e.target.value === "yes")}
            className={cn(
              selectCls,
              draft.audited &&
                "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            )}
          >
            <option value="no">Not audited</option>
            <option value="yes">Audited</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className={cn("hidden sm:grid gap-2 px-0.5", rowGrid)}>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Field
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reported
          </span>
          {beforeLabel && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {beforeLabel}
            </span>
          )}
          <span className="w-8" />
        </div>

        {draft.rows.map((row) => {
          const metric = enterable.find((m) => m.id === row.metricId);
          const locked = requiredIds.has(row.metricId);
          return (
            <div
              key={row.key}
              className={cn("grid gap-2 items-center", rowGrid)}
            >
              {locked ? (
                <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 text-[13px] text-foreground">
                  <span className="truncate">{metric?.name}</span>
                  <span
                    className="text-destructive"
                    title="Required on this project's reports"
                  >
                    *
                  </span>
                </div>
              ) : (
                <select
                  value={row.metricId}
                  onChange={(e) =>
                    patchRow(row.key, { metricId: e.target.value })
                  }
                  className={selectCls}
                >
                  <option value="">Pick a field…</option>
                  {pickable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}

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
                    type="text"
                    inputMode="decimal"
                    value={row.number}
                    onChange={(e) =>
                      patchRow(row.key, {
                        number: sanitizeAmount(e.target.value),
                      })
                    }
                    placeholder={metric ? "e.g. 120,000" : "Pick a field first"}
                    disabled={!metric}
                    className={cn(
                      inputCls,
                      "disabled:opacity-50",
                      metric?.type === "PERCENT" && "pr-7",
                      metric?.unit && metric.type === "NUMBER" && "pr-14"
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

              {beforeLabel && (
                <span className="hidden sm:block text-[12px] text-muted-foreground tabular-nums truncate">
                  {metric
                    ? formatMetricValue(metric, before.get(metric.id) ?? {})
                    : "—"}
                </span>
              )}

              {locked ? (
                <span className="w-8" />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      rows:
                        d.rows.length === 1
                          ? [blankFieldRow()]
                          : d.rows.filter((r) => r.key !== row.key),
                    }))
                  }
                  className="w-8 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Remove this line"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {pickable.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, rows: [...d.rows, blankFieldRow()] }))
            }
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add row
          </button>
        )}

        <p className="text-[11px] text-muted-foreground">
          Amounts in {currency} unless the field says otherwise.{" "}
          {requiredIds.size > 0
            ? "A field marked * has to be filled in — enter 0 if that's the figure."
            : "Leave a field off the report if it wasn't reported."}
          {beforeLabel &&
            ` The last column is what ${beforeLabel} reported, to check this period against.`}
        </p>
      </div>

      {/* Read rather than entered, so they sit apart from the lines above. */}
      {calculated.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {calculated.map((metric) => {
            const worked = evaluateFormula(
              metric.formulaOp,
              entered.get(metric.leftId ?? "") ?? null,
              entered.get(metric.rightId ?? "") ?? null
            );
            const from = formulaLabel(
              metric.formulaOp,
              metrics.find((m) => m.id === metric.leftId)?.name,
              metrics.find((m) => m.id === metric.rightId)?.name
            );
            const previously = evaluateFormula(
              metric.formulaOp,
              beforeNumbers.get(metric.leftId ?? "") ?? null,
              beforeNumbers.get(metric.rightId ?? "") ?? null
            );
            return (
              <DerivedField
                key={metric.id}
                label={`${metric.name} — ${from ?? "calculated"}`}
                value={
                  worked == null
                    ? "Report the fields it works from"
                    : formatMetricValue(metric, { numberValue: worked })
                }
                previously={
                  beforeLabel && previously != null
                    ? `${beforeLabel}: ${formatMetricValue(metric, {
                        numberValue: previously,
                      })}`
                    : null
                }
              />
            );
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelCls}>Do they need help?</label>
          <select
            value={draft.needsHelp ? "yes" : "no"}
            onChange={(e) => set("needsHelp", e.target.value === "yes")}
            className={cn(
              selectCls,
              draft.needsHelp &&
                "bg-amber-500/15 border-amber-500/30 text-amber-400"
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

      <div className="flex items-center justify-end gap-2">
        {blocked ? (
          <span className="text-[11px] text-muted-foreground mr-auto">
            {blocked}
          </span>
        ) : (
          warning && (
            <span className="text-[11px] text-amber-400 mr-auto">{warning}</span>
          )
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || blocked != null}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
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
    <CollapsibleCard
      icon={Layers}
      title="Dilution tranches — deal level"
      summary={
        portfolio.tranches.length > 0 ? portfolio.tranches.length : undefined
      }
      description="Older portfolio-wide milestones. New tranches belong to an equity entry above."
      className="mb-0"
    >
      {portfolio.tranches.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {portfolio.tranches.map((t) => (
            // Nothing is held back on a tranche, so it keeps the shape of a
            // record row without an arrow — there's no second half to it.
            <RecordRow
              key={t.id}
              index={t.order}
              title={formatPct(t.equityPct)}
              meta={`from ${formatValuation(
                t.startsAtValuation,
                currency,
              )} valuation`}
              actions={
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={busy}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
                  title="Remove tranche"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              }
            />
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
    </CollapsibleCard>
  );
}
