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
  BarChart3,
  GripVertical,
  Trash2,
  Layers,
  FileSignature,
  PieChart,
  Paperclip,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OpportunitySection } from "@/components/equity/opportunity-section";
import { PitchSectionCard } from "@/components/equity/pitch-section";
import { ProductSection } from "@/components/equity/product-section";
import { MarketSizeSection } from "@/components/equity/market-size-section";
import { TractionSection } from "@/components/equity/traction-section";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { FinancialsAnalysis } from "@/components/equity/financials-analysis";
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
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { AddButton } from "@/components/add-button";
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
  saveEquityFinancialDraft,
  publishEquityFinancialReport,
  discardEquityFinancialDraft,
  deleteEquityFinancialReport,
  type EquityHolderDTO,
  type EquityMetricDTO,
  type EquityRoleDTO,
  type EquityPortfolioDTO,
} from "@/actions/equity";
import {
  EQUITY_LENGTH_UNIT,
  EQUITY_STRUCTURE,
  FEE_STATUS,
  computePortfolioEquity,
  currentSet,
  computeContractEndDate,
  equityLabel,
  feeStatus,
  isFormulaMetric,
  isOngoing,
  formatContractLength,
  formatMetricValue,
  splitTotal,
  formatPct,
  formatValuation,
  isTrancheDiluted,
  splitTranchesByDilution,
} from "@/lib/equity-math";
import {
  figureAt,
  formatMonth,
  formatPackLabel,
  monthColumn,
  packCellsToValues,
  publishedPacks,
  resolveMonthlySeries,
  type MetricDef,
} from "@/lib/equity-financials";
import {
  MonthlyFiguresDialog,
  emptyPackDraft,
  packDraftToStored,
  packToDraft,
  type PackDraft,
} from "@/components/equity/monthly-figures-grid";

// The spin-button rules strip the steppers from every type="number" field here.
// They're a poor fit for figures typed in full — the arrows sit over the text,
// invite a stray scroll-wheel edit, and nudge by 1 on values in the thousands.
const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0";
const selectCls =
  "w-full h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";
const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

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
        className={cn(inputCls, "pe-7", className)}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-s text-muted-foreground pointer-events-none">
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
        <PageBackButton href="/dashboard/equity" label="Back to equity" />
        {portfolio.project.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portfolio.project.logoUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {portfolio.project.name[0]?.toUpperCase()}
          </div>
        )}
        <PageBreadcrumb
          items={[
            { label: "Equity", href: "/dashboard/equity" },
            { label: portfolio.project.name },
          ]}
        />
        <PortfolioMenu
          portfolioId={portfolio.id}
          projectName={portfolio.project.name}
        />
      </PageHeader>

      <div className="px-app py-6 max-w-5xl mx-auto">
        {/* Computed summary — derived from the tables below, nothing stored */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="app-card rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">
              {currentPct !== summary.granted
                ? "Our equity today"
                : "Our equity"}
            </p>
            <p className="text-l font-semibold text-foreground tabular-nums">
              {formatPct(currentPct)}
            </p>
            {/* Only worth saying once a later split has actually moved it. */}
            {currentPct !== summary.granted && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatPct(summary.granted)} granted
              </p>
            )}
          </div>
          <div className="app-card rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">
              Vested as of today
            </p>
            <p className="text-l font-semibold text-primary tabular-nums">
              {formatPct(summary.vested)}
            </p>
          </div>
          <div className="app-card rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">Contracts</p>
            <p className="text-l font-semibold text-foreground tabular-nums">
              {portfolio.contracts.length || "—"}
              {signedCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  · {signedCount} signed
                </span>
              )}
            </p>
          </div>
          <div className="app-card rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">
              Equity entries
            </p>
            <p className="text-l font-semibold text-foreground tabular-nums">
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

        {/* Who else is in the market, scored against the portfolio's anchors */}
        <PitchSectionCard
          portfolioId={portfolio.id}
          section="COMPETITION"
          items={pitchItems}
          anchors={portfolio.opportunity?.radarAnchors ?? []}
          usLabel={portfolio.project.name}
        />

        {/* Who is building it, dated — the latest lineup is the team today */}
        <TeamSection portfolio={portfolio} holders={holders} roles={roles} />

        {/* Contracts — repeatable related table */}
        <ContractsTable portfolio={portfolio} />

        {/* The split, versioned: who holds what as of each date, and the
          valuation that prices it */}
        <GrantsTable portfolio={portfolio} holders={holders} roles={roles} />

        {/* Packs of monthly P&L and cash as reported by the startup */}
        <FinancialsTable
          portfolio={portfolio}
          currency={portfolio.valuationCurrency}
          metrics={metrics}
        />

        {/* The same figures read rather than entered: the effective monthly P&L
          once the later reports have had their say */}
        <FinancialsAnalysis
          portfolio={portfolio}
          metrics={metrics}
          currency={portfolio.valuationCurrency}
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
          <AddButton
            label="Add contract"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          />
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
        <p className="text-s text-muted-foreground py-2">
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
                className="inline-flex items-center gap-xs mt-0.5 px-2 py-1 rounded-md border border-border bg-muted/40 text-xs text-foreground no-underline hover:border-muted-foreground/40 transition-colors max-w-full"
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
                "bg-success/15 border-success/30 text-success"
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
              "flex h-9 items-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-s",
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
            <span className="flex h-9 w-[104px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-s text-muted-foreground">
              {currency}
            </span>
          </div>
        </div>
        <div>
          <label className={labelCls}>Billing status — calculated</label>
          <div
            className={cn(
              "flex h-9 items-center rounded-lg border border-dashed px-3 text-s",
              status === "NONE" || !draft.monthlyFee
                ? "border-border bg-muted/30 text-muted-foreground"
                : status === "ACTUAL"
                ? "border-success/30 bg-success/10 text-success"
                : "border-sky/30 bg-sky/10 text-sky"
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
                className="text-s text-foreground truncate no-underline hover:underline"
              >
                {draft.fileName || "Contract file"}
              </a>
              {formatFileSize(draft.fileSize) && (
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  {formatFileSize(draft.fileSize)}
                </span>
              )}
              <button
                type="button"
                onClick={clearFile}
                disabled={busy}
                className="ms-auto w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
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
              className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border border-dashed border-border bg-card text-s text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50"
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
          className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          disabled={busy || uploading}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-s font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
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
          <span className="text-xs text-muted-foreground tabular-nums">
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
          <AddButton
            label={latest ? "New split" : "Add equity"}
            onClick={() => setEditing("new")}
            disabled={portfolio.contracts.length === 0}
            title={
              portfolio.contracts.length === 0
                ? "Add a contract first"
                : latest
                  ? "New split"
                  : "Add equity"
            }
          />
        )
      }
    >
      {portfolio.contracts.length === 0 ? (
        <p className="text-s text-muted-foreground py-2">
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
        <p className="text-s text-muted-foreground py-2">
          No equity defined yet.
        </p>
      )}
    </CollapsibleCard>
  );
}

/** A saved cell — shaped like the field it mirrors, minus the ability to type. */
const readCellCls =
  "h-9 px-3 rounded-lg border border-border bg-muted/30 flex items-center text-s text-foreground";

// Tracks the form's columns so a saved row lands where it was typed.
const GRANT_VIEW_GRID =
  "grid-cols-1 @md/card:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10.5rem]";

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
      <div className="grid gap-3 @md/card:grid-cols-[minmax(0,1fr)_14rem]">
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
                <span className="text-xs text-muted-foreground shrink-0">
                  {currency}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-6">
        <div className={cn("@max-md/card:hidden @md/card:grid gap-2 px-0.5", GRANT_VIEW_GRID)}>
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
                          (diluted ? "text-orange" : "text-success")
                      )}
                    >
                      {milestone.startsAtValuation.toLocaleString("en-US")}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {currency}
                    </span>
                  </div>
                ) : (
                  <span className="hidden sm:block text-s text-muted-foreground/30 text-center">
                    —
                  </span>
                )}
              </div>

              {g.notes && (
                <p className="text-xs text-muted-foreground/70 sm:ps-1 whitespace-pre-wrap">
                  {g.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          Total{" "}
          <span
            className={cn(
              "font-medium",
              Math.abs(total - 100) < 0.001 ? "text-primary" : "text-orange"
            )}
          >
            {formatPct(total)}
          </span>
        </p>
        {currentValuation != null && tranches.length > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            At {formatValuation(currentValuation, currency)}:{" "}
            <span className="text-orange font-medium">
              {formatPct(split.diluted)}
            </span>{" "}
            diluted ·{" "}
            <span className="text-success font-medium">
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
  "grid-cols-1 @md/card:grid-cols-[1rem_5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10.5rem_1.75rem]";

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
            className={cn(inputCls, "pe-11 text-s")}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {currency}
          </span>
        </div>
      ) : (
        <span className="hidden sm:block text-s text-muted-foreground/30 text-center">
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
      <div className="grid gap-3 @md/card:grid-cols-[minmax(0,1fr)_10rem_14rem]">
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
          <p className="text-xs text-muted-foreground mt-1">
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
          <p className="text-xs text-muted-foreground mt-1">
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
              className={cn(inputCls, "pe-11")}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              {currency}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            What the company is worth today.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-6">
        <div className={cn("@max-md/card:hidden @md/card:grid gap-2 px-0.5", GRANT_ROW_GRID)}>
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

        <AddButton
          label="Add row"
          onClick={() => setRows((rs) => [...rs, emptyGrantRow()])}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          Total{" "}
          <span
            className={cn(
              "font-medium",
              balanced ? "text-primary" : "text-orange"
            )}
          >
            {formatPct(total)}
          </span>
          {!balanced && (
            <span className="text-orange">
              {" "}
              —{" "}
              {remaining > 0
                ? `${formatPct(remaining)} left to allocate`
                : `${formatPct(-remaining)} over`}
            </span>
          )}
        </p>
        {missingHint && (
          <p className="order-last basis-full text-xs text-orange">
            {missingHint}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors"
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
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-s font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
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

/** Every field the registry offers a financial report, asked for or not. */
function financialFields(metrics: EquityMetricDTO[]) {
  return metrics.filter((m) => m.group === "FINANCIAL");
}


/**
 * One pack read back month by month: what it states, plus what the calculated
 * fields work out to from it. Calculations are done here rather than stored, so
 * a corrected figure corrects everything standing on it — including the formulas
 * that stand on other formulas, which is what the recursive resolver is for.
 *
 * Figures reported against a field that has since left the registry are listed
 * after the rest. Deleting a field doesn't unmake the answers given to it, and
 * a pack that reported something should still say so.
 */
function readPackMonths(
  fields: EquityMetricDTO[],
  metrics: EquityMetricDTO[],
  pack: EquityPortfolioDTO["financialReports"][number]
) {
  const registry = new Map<string, MetricDef>(metrics.map((m) => [m.id, m]));
  const values = packRowValues(pack, metrics);

  // Just this pack, so a row shows what the pack itself says rather than what
  // the project's latest figures are — a restated month is read on the pack
  // that restated it, not on the one being looked at.
  const series = resolveMonthlySeries([{ ...pack, values }]);
  const onList = new Set(fields.map((f) => f.id));

  const dropped = new Map<string, EquityMetricDTO | { id: string; name: string; type: string; unit: string | null }>();
  for (const value of values) {
    if (!onList.has(value.metricId)) dropped.set(value.metricId, value.metric);
  }

  const rows = [
    ...fields.map((f) => ({ metric: f as MetricDef & { name: string; unit: string | null }, asked: true })),
    ...[...dropped.values()].map((metric) => ({
      metric: metric as MetricDef & { name: string; unit: string | null },
      asked: false,
    })),
  ];

  return series.months.map((month) => {
    const column = monthColumn(
      series,
      registry,
      rows.map((r) => r.metric.id),
      month
    );
    return {
      month,
      label: formatMonth(month),
      fields: rows.flatMap(({ metric, asked }) => {
        const stored = figureAt(series, metric.id, month);
        // A calculated field has no stored figure, so it reads from the column;
        // everything else reads its own value, dates included.
        const display = isFormulaMetric(metric.type)
          ? formatMetricValue(metric, { numberValue: column.get(metric.id) ?? null })
          : stored
            ? formatMetricValue(metric, stored)
            : "—";
        const reported = isFormulaMetric(metric.type)
          ? column.get(metric.id) != null
          : stored != null;
        // A field this pack says nothing about isn't shown at all: a month the
        // pack didn't report a figure for is a gap, not a dash to scan past.
        if (!reported && !asked) return [];
        return [{ metric, reported, display }];
      }),
    };
  });
}

/**
 * The figures a pack's row shows.
 *
 * A published pack shows what it published. A pack that has never been
 * published has no published figures at all, so its row is read from the
 * working copy instead — a draft somebody has spent an hour on should not read
 * as "Nothing reported" in the list.
 *
 * The draft is text, so this is also where a cell that never became a figure is
 * dropped, the same way publishing would drop it.
 */
function packRowValues(
  report: EquityPortfolioDTO["financialReports"][number],
  metrics: EquityMetricDTO[]
) {
  if (report.publishedAt || !report.draft) return report.values;

  const byId = new Map(metrics.map((m) => [m.id, m]));
  return packCellsToValues(report.draft.cells, byId).flatMap((v) => {
    const metric = byId.get(v.metricId);
    return metric ? [{ ...v, metric, id: `${v.metricId}|${v.month}`, order: 0 }] : [];
  });
}

/**
 * Every other pack except one, resolved — what a cell in that pack is up
 * against.
 *
 * Published only. A draft restates nothing, so marking a cell as superseded by
 * one would be telling somebody their figure doesn't count when it does.
 */
function otherPacksSeries(
  reports: EquityPortfolioDTO["financialReports"],
  exceptId: string | null
) {
  return resolveMonthlySeries(
    publishedPacks(reports)
      .filter((r) => r.id !== exceptId)
      .map((r) => ({
        id: r.id,
        reportedOn: r.reportedOn,
        audited: r.audited,
        values: r.values,
      }))
  );
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

  const reports = portfolio.financialReports;
  // Every financial field in the registry, in the order the registry lists
  // them. There is no per-project questionnaire: a field a project has nothing
  // to say about is a blank month, which the grid already distinguishes from a
  // reported zero.
  const fields = financialFields(metrics);
  const pendingDelete = reports.find((r) => r.id === deletingId) ?? null;
  const editing = reports.find((r) => r.id === editingId) ?? null;

  /**
   * The grid's autosave. Deliberately silent — no refresh, no spinner on the
   * page behind. It fires while somebody is mid-figure, and a page re-rendering
   * under a grid being typed into is worse than a list that's a few seconds out
   * of date until the pack is closed.
   */
  async function handleSaveDraft(reportId: string | null, draft: PackDraft) {
    const saved = await saveEquityFinancialDraft(
      portfolio.id,
      reportId,
      packDraftToStored(draft),
    );
    return saved.id;
  }

  // Errors are left to the dialog, which keeps them beside the box that has to
  // be corrected instead of in an alert that closes over it.
  async function handleDelete(reportId: string, typed: string) {
    await deleteEquityFinancialReport(reportId, typed);
    router.refresh();
  }

  return (
    <CollapsibleCard
      icon={BarChart3}
      title="Financials"
      summary={reports.length > 0 ? reports.length : undefined}
      description="Each report is a pack of figures received from the founders, month by month. A later pack restates the months it covers and the earlier version stays as history. A calculated field is worked out from the figures rather than entered. Figures don't count anywhere until the report is published."
      actions={
        fields.length > 0 && (
          <AddButton
            label="Add report"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          />
        )
      }
    >
      {fields.length === 0 ? (
        <p className="text-s text-muted-foreground py-2">
          Nothing to report on yet — define what a report is made of under{" "}
          <Link href="/dashboard/equity" className="text-primary hover:underline">
            Financials data
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          {reports.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {reports.map((r) => (
                <FinancialReportRow
                  key={r.id}
                  report={r}
                  fields={fields}
                  metrics={metrics}
                  onEdit={() => {
                    setEditingId(r.id);
                    setAdding(false);
                  }}
                  onDelete={() => setDeletingId(r.id)}
                />
              ))}
            </div>
          )}

          {adding && (
            <MonthlyFiguresDialog
              title={`${portfolio.project.name} — new financial report`}
              initial={emptyPackDraft()}
              reportId={null}
              published={false}
              currency={currency}
              metrics={metrics}
              fields={fields}
              otherPacks={otherPacksSeries(reports, null)}
              onSave={handleSaveDraft}
              onPublish={publishEquityFinancialReport}
              onDiscard={discardEquityFinancialDraft}
              onClose={() => {
                setAdding(false);
                router.refresh();
              }}
            />
          )}

          {editing && (
            <MonthlyFiguresDialog
              key={editing.id}
              title={`${portfolio.project.name} — ${formatPackLabel(editing.reportedOn)} report`}
              initial={packToDraft(editing)}
              reportId={editing.id}
              published={editing.publishedAt != null}
              currency={currency}
              metrics={metrics}
              fields={fields}
              // Itself excluded: a pack doesn't restate its own figures.
              otherPacks={otherPacksSeries(reports, editing.id)}
              onSave={handleSaveDraft}
              onPublish={publishEquityFinancialReport}
              onDiscard={discardEquityFinancialDraft}
              onClose={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          )}

          {reports.length === 0 && (
            <p className="text-s text-muted-foreground py-2">
              No financial reports yet.
            </p>
          )}

          {pendingDelete && (
            <ConfirmDeleteDialog
              key={pendingDelete.id}
              open
              onOpenChange={(open) => !open && setDeletingId(null)}
              title={`Delete the ${formatPackLabel(pendingDelete.reportedOn)} report?`}
              description="This removes the report and every figure it stated. Any month it restated falls back to what the report before it said. Unlike a portfolio, a report doesn't go to the trash — it's gone, and the figures have to be asked for again."
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
  fields,
  metrics,
  onEdit,
  onDelete,
}: {
  report: EquityPortfolioDTO["financialReports"][number];
  fields: EquityMetricDTO[];
  metrics: EquityMetricDTO[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const months = readPackMonths(fields, metrics, r);
  const published = r.publishedAt != null;

  return (
    <RecordRow
      title={`${formatPackLabel(r.reportedOn)} report`}
      badges={
        <>
          {/* Whether the figures count comes first, ahead of whether they were
              audited: a draft's figures are nowhere yet, which matters more
              about a row than how well attested they are. */}
          {!published ? (
            <RecordBadge tone="warn">Draft</RecordBadge>
          ) : (
            r.draft != null && <RecordBadge tone="warn">Unpublished changes</RecordBadge>
          )}
          <RecordBadge tone={r.audited ? "good" : "neutral"}>
            {r.audited ? "Audited" : "Unaudited"}
          </RecordBadge>
        </>
      }
      // Which months it covers, rather than a figure from one of them: a pack of
      // seven months has no single headline number, and picking one would read
      // as the pack's total.
      meta={
        months.length === 0
          ? "Nothing reported"
          : months.length === 1
            ? months[0].label
            : `${months.length} months · ${months[0].label} to ${months[months.length - 1].label}`
      }
      actions={
        <RowActions
          label="Report options"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      }
    >
      {months.map((month) => (
        <div key={month.month} className="mb-2 last:mb-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {month.label}
          </div>
          <RecordDetails>
            {month.fields.map((f) => (
              <RecordDetail key={f.metric.id} label={f.metric.name} value={f.display} />
            ))}
          </RecordDetails>
        </div>
      ))}
      <RecordDetails>
        {r.documents.length > 0 && (
          <RecordDetail
            label="Documents"
            span
            value={
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {r.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-xs text-foreground no-underline hover:underline"
                  >
                    <Paperclip
                      className="w-3 h-3 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    {doc.filename}
                  </a>
                ))}
              </span>
            }
          />
        )}
      </RecordDetails>
    </RecordRow>
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
        <AddButton
          label="Add tranche"
          onClick={handleAdd}
          disabled={busy || !equityPct || !valuation}
        />
      </div>
    </CollapsibleCard>
  );
}
