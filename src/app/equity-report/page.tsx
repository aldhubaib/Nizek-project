import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Coins,
  Info,
  PieChart,
  TrendingUp,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolios, type EquityPortfolioDTO } from "@/actions/equity";
import { cn } from "@/lib/utils";
import {
  EQUITY_FREQUENCY,
  EQUITY_STRUCTURE,
  computePortfolioEquity,
  computeVestedPct,
  equityLabel,
  equityValueAt,
  formatContractLength,
  formatPct,
  formatValuation,
  isTrancheDiluted,
  valuationAsOf,
} from "@/lib/equity-math";
import { PrintButton } from "./print-button";
import { ReportVariantPicker } from "./report-variant-picker";
import {
  REPORT_VARIANT,
  parseReportVariant,
  type ReportVariant,
} from "./report-variant";

export const metadata = { title: "Equity status report" };

const ACCENT = "#ff3366";

const cardCls = "rounded-xl border border-white/10 bg-white/[0.04]";
const thCls =
  "py-1.5 pr-4 text-left text-[10px] font-normal text-white/40 whitespace-nowrap";
const tdCls = "py-1.5 pr-4 text-[11px] text-white align-top";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

/**
 * The equity structures in play, deduped. A project can hold several grants and
 * a contract can carry more than one, so this is a list rather than one value.
 */
function structureLabel(grants: { structureType: string }[]): string {
  const kinds = [...new Set(grants.map((g) => g.structureType))];
  if (kinds.length === 0) return "—";
  return kinds.map((k) => equityLabel(EQUITY_STRUCTURE, k)).join(", ");
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

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight text-white", className)}>
      nizek<span style={{ color: ACCENT }}>.</span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5"
      style={{ color: ACCENT }}
    >
      {children}
    </p>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className={cn(cardCls, "flex items-center gap-2.5 px-3 py-2.5")}>
      <Icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/40">
          {label}
        </p>
        <p className="text-[13px] font-bold text-white tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

function PortfolioSection({
  portfolio,
  variant,
}: {
  portfolio: EquityPortfolioDTO;
  variant: ReportVariant;
}) {
  // Whether a contract has been signed yet is a negotiating position, not
  // something an investor is shown.
  const showContractStatus = variant === "nizek";
  const currency = portfolio.valuationCurrency;
  const { granted, vested } = computePortfolioEquity(portfolio);
  const current = valuationAsOf(portfolio.valuations);
  const grantedWorth = equityValueAt(granted, current?.amount ?? null);
  const vestedWorth = equityValueAt(vested, current?.amount ?? null);

  return (
    // The rule sits above every project rather than between them, so the first
    // one is separated from the overview table by the same line and spacing as
    // each subsequent project gets from the one before it.
    <section className="mt-10 pt-8 border-t border-white/15 break-inside-avoid">
      <div className="mb-2.5">
        <h2 className="text-[19px] font-bold text-white tracking-tight">
          {portfolio.project.name}
        </h2>
        {portfolio.project.description && (
          <p className="text-[11px] text-white/50 leading-relaxed mt-1 whitespace-pre-wrap">
            {portfolio.project.description}
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-4 gap-2.5 mb-4"
        style={{ color: ACCENT }}
      >
        <Stat icon={PieChart} label="Total equity" value={formatPct(granted)} />
        <Stat
          icon={CheckCircle2}
          label="Vested today"
          value={formatPct(vested)}
        />
        <Stat
          icon={Coins}
          label="Current valuation"
          value={current ? formatValuation(current.amount, currency) : "—"}
        />
        <Stat
          icon={TrendingUp}
          label="Vested worth"
          value={
            vestedWorth != null
              ? formatValuation(Math.round(vestedWorth), currency)
              : "—"
          }
        />
      </div>

      <SectionLabel>Contracts</SectionLabel>
      {portfolio.contracts.length === 0 ? (
        <p className="text-[11px] text-white/40 mb-4">No contracts recorded.</p>
      ) : (
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="border-b border-white/15">
              <th className={thCls}>Contract</th>
              <th className={thCls}>Type</th>
              {showContractStatus && <th className={thCls}>Status</th>}
              <th className={thCls}>Term</th>
              <th className={thCls}>Length</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.contracts.map((c, i) => (
              <tr key={c.id} className="border-b border-white/[0.07]">
                <td className={tdCls}>{c.title || `Contract ${i + 1}`}</td>
                <td className={tdCls}>
                  {structureLabel(
                    portfolio.grants.filter((g) => g.contractId === c.id)
                  )}
                </td>
                {showContractStatus && (
                  <td className={tdCls}>
                    {c.signed ? "Signed" : "Not signed"}
                  </td>
                )}
                <td className={tdCls}>
                  {formatDate(c.startDate)} → {formatDate(c.endDate)}
                </td>
                <td className={tdCls}>
                  {formatContractLength(c.lengthValue, c.lengthUnit) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SectionLabel>Equity</SectionLabel>
      {portfolio.grants.length === 0 ? (
        <p className="text-[11px] text-white/40">No equity defined yet.</p>
      ) : (
        portfolio.grants.map((g) => {
          const contract = portfolio.contracts.find(
            (c) => c.id === g.contractId
          );
          // Vesting always follows the linked contract's term.
          const grantVested = computeVestedPct({
            totalEquityPct: g.equityPct,
            vestingStartDate: contract?.startDate ?? null,
            vestingEndDate: contract?.endDate ?? null,
            vestingFrequency: null,
          });

          return (
            <div
              key={g.id}
              className={cn(cardCls, "px-3.5 py-3 mb-2 break-inside-avoid")}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[11px] font-semibold text-white">
                  {contractLabel(portfolio.contracts, g.contractId)}
                  <span className="font-normal text-white/40">
                    {" · "}
                    {equityLabel(EQUITY_STRUCTURE, g.structureType)}
                    {g.structureType === "DIVIDEND" &&
                      ` · ${equityLabel(
                        EQUITY_FREQUENCY,
                        g.dividendFrequency
                      )} dividends`}
                  </span>
                </span>
                <span className="text-[11px] text-white/70 tabular-nums whitespace-nowrap">
                  {formatPct(g.equityPct)} granted
                  {grantVested != null && ` · ${formatPct(grantVested)} vested`}
                </span>
              </div>

              {g.tranches.length > 0 && (
                <table className="w-full border-collapse mt-2">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      <th className={thCls}>Tranche</th>
                      <th className={thCls}>Dilutes at</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.tranches.map((t) => (
                      <tr key={t.id}>
                        <td className={tdCls}>{formatPct(t.equityPct)}</td>
                        <td className={tdCls}>
                          {formatValuation(t.startsAtValuation, currency)}
                        </td>
                        <td className={tdCls}>
                          {current == null
                            ? "Not valued yet"
                            : isTrancheDiluted(
                                  t.startsAtValuation,
                                  current.amount
                                )
                              ? "Diluted"
                              : "Not diluted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {g.notes && (
                <p className="text-[10px] text-white/50 mt-1.5 whitespace-pre-wrap">
                  {g.notes}
                </p>
              )}
            </div>
          );
        })
      )}

      {current && grantedWorth != null && (
        <div className="flex items-center gap-1.5 mt-2">
          <Info
            className="w-3 h-3 shrink-0"
            strokeWidth={1.5}
            style={{ color: ACCENT }}
          />
          <p className="text-[10px] text-white/55">
            At {formatValuation(current.amount, currency)}, {formatPct(granted)}{" "}
            granted is worth{" "}
            {formatValuation(Math.round(grantedWorth), currency)}.
          </p>
        </div>
      )}
    </section>
  );
}

export default async function EquityReportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const { view } = await searchParams;
  const variant = parseReportVariant(view);
  const showContractStatus = variant === "nizek";
  const portfolios = await getEquityPortfolios();
  const generatedAt = new Date();

  return (
    <div className="min-h-screen bg-[#0a0a0a] py-8 print:py-0">
      {/* The dark sheet is the design, so backgrounds have to survive printing —
          browsers drop them unless print-color-adjust is forced. Zero page
          margins let the sheet bleed to the paper edge; the padding below
          stands in for them. */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body {
            background: #0a0a0a !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="mx-auto w-[210mm] max-w-full bg-[#0a0a0a] px-10 py-9 print:w-full print:px-[14mm] print:py-[14mm]">
        <header>
          <div className="flex items-start justify-between gap-4 mb-5">
            <Wordmark className="text-[26px]" />
            <div className="flex items-center gap-2">
              <ReportVariantPicker variant={variant} />
              <PrintButton />
            </div>
          </div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">
            Equity status report
          </h1>
          {/* Named on the page itself, since the picker is hidden when printing
              and a printed copy would otherwise be impossible to tell apart. */}
          <p className="text-[10px] text-white/40 mt-1">
            {REPORT_VARIANT[variant]} · {portfolios.length} project
            {portfolios.length === 1 ? "" : "s"} · generated{" "}
            {generatedAt.toLocaleString()}
          </p>
        </header>

        {portfolios.length === 0 ? (
          <p className="text-[12px] text-white/40 mt-6">
            No equity portfolios yet.
          </p>
        ) : (
          <>
            <div className={cn(cardCls, "px-3.5 py-3 mt-5 break-inside-avoid")}>
              <SectionLabel>All projects</SectionLabel>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/15">
                    <th className={thCls}>Project</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>Equity</th>
                    <th className={thCls}>Vested</th>
                    <th className={thCls}>Contracts</th>
                    {showContractStatus && <th className={thCls}>Signed</th>}
                    <th className={thCls}>Valuation</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.map((p) => {
                    const { granted, vested } = computePortfolioEquity(p);
                    const current = valuationAsOf(p.valuations);
                    return (
                      <tr key={p.id} className="border-b border-white/[0.07]">
                        <td className={tdCls}>{p.project.name}</td>
                        <td className={tdCls}>{structureLabel(p.grants)}</td>
                        <td className={tdCls}>{formatPct(granted)}</td>
                        <td className={tdCls}>{formatPct(vested)}</td>
                        <td className={tdCls}>{p.contracts.length || "—"}</td>
                        {showContractStatus && (
                          <td className={tdCls}>
                            {p.contracts.filter((c) => c.signed).length || "—"}
                          </td>
                        )}
                        <td className={tdCls}>
                          {current
                            ? formatValuation(
                                current.amount,
                                p.valuationCurrency
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {portfolios.map((p) => (
              <PortfolioSection key={p.id} portfolio={p} variant={variant} />
            ))}
          </>
        )}

        <footer className="mt-9 pt-3.5 border-t border-white/10 flex items-center gap-3.5">
          <Wordmark className="text-[19px]" />
          <div className="w-px self-stretch bg-white/15" />
          <p className="flex-1 text-[9px] leading-relaxed text-white/40">
            Empowering ideas. Building value.
            <br />
            This report reflects the equity status of your projects and
            associated contracts.
          </p>
          <span
            className="text-[10px] font-semibold"
            style={{ color: ACCENT }}
          >
            nizek.com
          </span>
        </footer>
      </div>
    </div>
  );
}
