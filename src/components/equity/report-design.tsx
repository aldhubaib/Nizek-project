import {
  Building2,
  CheckCircle2,
  Coins,
  FileSignature,
  Hammer,
  Info,
  PieChart,
  Rocket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/linkified-text";
import type { EquityPortfolioDTO } from "@/actions/equity";
import {
  EQUITY_STRUCTURE,
  currentSet,
  computePortfolioEquity,
  vestedForGrant,
  equityLabel,
  equityValueAt,
  formatContractLength,
  isOngoing,
  formatLiveStatus,
  formatPct,
  formatValuation,
  isTrancheDiluted,
  liveStatus,
  summarisePortfolios,
} from "@/lib/equity-math";
import type { ReportVariant } from "@/app/equity-report/report-variant";

/**
 * The look of the equity report: the dark sheet, the brand red, the stat cards
 * and the per-project write-up.
 *
 * It lives here rather than in the report page because the same design is read
 * two ways — printed as a document, and previewed inside the dashboard for a
 * single project. One copy, so the printed report and what you check it against
 * can't drift apart.
 */

export const ACCENT = "#ff3366";

export const cardCls = "rounded-xl border border-border bg-white/[0.04]";
export const thCls =
  "py-1.5 pe-4 text-start text-xs font-normal text-white/40 whitespace-nowrap";
export const tdCls = "py-1.5 pe-4 text-xs text-white align-top";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

/**
 * The equity structures in play, deduped. A project can hold several grants and
 * a contract can carry more than one, so this is a list rather than one value.
 */
export function structureLabel(grants: { structureType: string }[]): string {
  const kinds = [...new Set(grants.map((g) => g.structureType))];
  if (kinds.length === 0) return "—";
  return kinds.map((k) => equityLabel(EQUITY_STRUCTURE, k)).join(", ");
}

function contractLabel(
  contracts: EquityPortfolioDTO["contracts"],
  contractId: string | null,
): string {
  if (!contractId) return "No contract linked";
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx === -1) return "Contract removed";
  return contracts[idx].title || `Contract ${idx + 1}`;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight text-white", className)}>
      nizek<span style={{ color: ACCENT }}>.</span>
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-bold uppercase tracking-[0.12em] mb-1.5"
      style={{ color: ACCENT }}
    >
      {children}
    </p>
  );
}

export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className={cn(cardCls, "flex items-center gap-s px-3 py-2.5")}>
      <Icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
          {label}
        </p>
        <p className="text-s font-bold text-white tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

/** Everything we hold, added up: the top of the report and of the preview. */
export function PortfolioSummary({
  portfolios,
  variant,
}: {
  portfolios: EquityPortfolioDTO[];
  variant: ReportVariant;
}) {
  const summary = summarisePortfolios(portfolios);
  // A count of signed agreements would leak exactly what the Signed column is
  // withheld from investors to hide.
  const showContractStatus = variant === "nizek";

  // Mixed valuation currencies leave the totals unset rather than adding sums
  // that aren't comparable; say so instead of showing an empty dash that reads
  // as "nothing on record".
  const money = (value: number | null) =>
    summary.currency != null
      ? formatValuation(Math.round(value ?? 0), summary.currency)
      : summary.valuedCompanies > 0
        ? "Mixed currencies"
        : "—";

  return (
    <div className={cn(cardCls, "px-3.5 py-3 mt-5 break-inside-avoid")}>
      <SectionLabel>Portfolio summary</SectionLabel>
      <div className="grid grid-cols-4 gap-s" style={{ color: ACCENT }}>
        <Stat
          icon={Building2}
          label="Portfolio companies"
          value={String(summary.companies)}
        />
        <Stat
          icon={PieChart}
          label="Total equity owned"
          value={formatPct(summary.currentPct)}
        />
        <Stat
          icon={CheckCircle2}
          label="Total equity vested"
          value={formatPct(summary.vestedPct)}
        />
        {showContractStatus && (
          <Stat
            icon={FileSignature}
            label="Signed agreements"
            value={String(summary.signedCompanies)}
          />
        )}
        <Stat
          icon={Hammer}
          label="In active development"
          value={String(summary.inDevelopment)}
        />
        <Stat
          icon={Rocket}
          label="Live products"
          value={String(summary.liveCompanies)}
        />
        <Stat
          icon={Wallet}
          label="Portfolio valuation"
          value={money(summary.portfolioValuation)}
        />
        <Stat
          icon={TrendingUp}
          label="Current equity value"
          value={money(summary.currentEquityValue)}
        />
      </div>

      {/* A total drawn from a subset of the portfolio understates it, so the
          coverage is stated rather than left for the reader to infer. */}
      {summary.valuedCompanies < summary.companies && (
        <div className="flex items-center gap-xs mt-2">
          <Info
            className="w-3 h-3 shrink-0"
            strokeWidth={1.5}
            style={{ color: ACCENT }}
          />
          <p className="text-xs text-white/55">
            Valuation totals cover the {summary.valuedCompanies} of{" "}
            {summary.companies}{" "}
            {summary.companies === 1 ? "company" : "companies"} with a valuation
            on record.
          </p>
        </div>
      )}
    </div>
  );
}

/** One line per project, before each gets its own write-up further down. */
export function AllProjectsTable({
  portfolios,
  variant,
}: {
  portfolios: EquityPortfolioDTO[];
  variant: ReportVariant;
}) {
  const showContractStatus = variant === "nizek";

  return (
    <div className={cn(cardCls, "px-3.5 py-3 mt-3 break-inside-avoid")}>
      <SectionLabel>All projects</SectionLabel>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={thCls}>Project</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Equity</th>
            <th className={thCls}>Vested</th>
            {showContractStatus && <th className={thCls}>Signed</th>}
            <th className={thCls}>Valuation</th>
          </tr>
        </thead>
        <tbody>
          {portfolios.map((p) => {
            const { held, vested } = computePortfolioEquity(p);
            const latest = currentSet(p.sets);
            const current = latest?.valuation ?? null;
            return (
              <tr key={p.id} className="border-b border-border">
                <td className={tdCls}>{p.project.name}</td>
                <td className={tdCls}>{structureLabel(latest?.grants ?? [])}</td>
                <td className={tdCls}>{formatPct(held)}</td>
                <td className={tdCls}>{formatPct(vested)}</td>
                {showContractStatus && (
                  <td className={tdCls}>
                    {p.contracts.filter((c) => c.signed).length || "—"}
                  </td>
                )}
                <td className={tdCls}>
                  {current != null
                    ? formatValuation(current, p.valuationCurrency)
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioSection({
  portfolio,
  variant,
  /**
   * The rule and the space above it separate one project from the last, which
   * a preview of a single project has no use for.
   */
  divider = true,
}: {
  portfolio: EquityPortfolioDTO;
  variant: ReportVariant;
  divider?: boolean;
}) {
  // Whether a contract has been signed yet is a negotiating position, not
  // something an investor is shown.
  const showContractStatus = variant === "nizek";
  const currency = portfolio.valuationCurrency;
  // The first split is what we were granted, the latest is what we hold, and
  // vesting is measured against the latter.
  const { granted, held, vested: vestedHeld } = computePortfolioEquity(portfolio);
  const diluted = held !== granted;
  const latest = currentSet(portfolio.sets);
  const current = latest?.valuation ?? null;
  const heldWorth = equityValueAt(held, current);
  const vestedWorth = equityValueAt(vestedHeld, current);

  return (
    // The rule sits above every project rather than between them, so the first
    // one is separated from the overview table by the same line and spacing as
    // each subsequent project gets from the one before it.
    <section
      className={cn(
        "break-inside-avoid",
        divider && "mt-xl pt-xl border-t border-border",
      )}
    >
      {/* Spaced off the stat cards below unconditionally, so projects with a
          description and projects without one keep the same rhythm. */}
      <div className="mb-10">
        {/* Centred against the title rather than sat on its baseline, so the
            pill reads as a tag on the heading instead of a dropped word. */}
        <div className="flex items-center gap-s flex-wrap">
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {portfolio.project.name}
          </h2>
          {portfolio.liveDate && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap",
                liveStatus(portfolio.liveDate) === "LIVE"
                  ? "bg-success/15 text-success"
                  : "bg-orange/15 text-orange",
              )}
            >
              {formatLiveStatus(portfolio.liveDate)}
            </span>
          )}
        </div>
        {portfolio.project.description && (
          <LinkifiedText
            text={portfolio.project.description}
            className="text-xs text-white/50 leading-relaxed mt-1.5"
            linkClassName="text-white/75"
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-s mb-8" style={{ color: ACCENT }}>
        <Stat
          icon={PieChart}
          label={diluted ? "Equity today" : "Total equity"}
          value={formatPct(held)}
        />
        <Stat
          icon={CheckCircle2}
          label="Vested today"
          value={formatPct(vestedHeld)}
        />
        <Stat
          icon={Coins}
          label="Current valuation"
          value={current != null ? formatValuation(current, currency) : "—"}
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
        <p className="text-xs text-white/40 mb-8">No contracts recorded.</p>
      ) : (
        <table className="w-full border-collapse mb-8">
          <thead>
            <tr className="border-b border-border">
              <th className={thCls}>Contract</th>
              <th className={thCls}>Type</th>
              {showContractStatus && <th className={thCls}>Status</th>}
              <th className={thCls}>Term</th>
              <th className={thCls}>Length</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.contracts.map((c, i) => (
              <tr key={c.id} className="border-b border-border">
                <td className={tdCls}>{c.title || `Contract ${i + 1}`}</td>
                <td className={tdCls}>
                  {structureLabel(
                    (latest?.grants ?? []).filter((g) => g.contractId === c.id),
                  )}
                </td>
                {showContractStatus && (
                  <td className={tdCls}>{c.signed ? "Signed" : "Not signed"}</td>
                )}
                <td className={tdCls}>
                  {formatDate(c.startDate)} →{" "}
                  {isOngoing(c.lengthUnit) ? "no end date" : formatDate(c.endDate)}
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
      {!latest || latest.grants.length === 0 ? (
        <p className="text-xs text-white/40">No equity defined yet.</p>
      ) : (
        latest.grants.map((g) => {
          const contract = portfolio.contracts.find((c) => c.id === g.contractId);
          // Vesting always follows the linked contract's term, except an
          // ongoing one, which has no term and so is held outright.
          const grantVested = vestedForGrant(g.equityPct, contract);

          return (
            <div
              key={g.id}
              className={cn(cardCls, "px-3.5 py-3 mb-2 break-inside-avoid")}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-semibold text-white">
                  {contractLabel(portfolio.contracts, g.contractId)}
                  <span className="font-normal text-white/40">
                    {" · "}
                    {equityLabel(EQUITY_STRUCTURE, g.structureType)}
                  </span>
                </span>
                <span className="text-xs text-white/70 tabular-nums whitespace-nowrap">
                  {formatPct(g.equityPct)} granted
                  {grantVested != null && ` · ${formatPct(grantVested)} vested`}
                </span>
              </div>

              {g.tranches.length > 0 && (
                <table className="w-full border-collapse mt-2">
                  <thead>
                    <tr className="border-b border-border">
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
                            : isTrancheDiluted(t.startsAtValuation, current)
                              ? "Diluted"
                              : "Not diluted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {g.notes && (
                <p className="text-xs text-white/50 mt-1.5 whitespace-pre-wrap">
                  {g.notes}
                </p>
              )}
            </div>
          );
        })
      )}

      {current != null && heldWorth != null && (
        <div className="flex items-center gap-xs mt-2">
          <Info
            className="w-3 h-3 shrink-0"
            strokeWidth={1.5}
            style={{ color: ACCENT }}
          />
          <p className="text-xs text-white/55">
            At {formatValuation(current, currency)}, {formatPct(held)}{" "}
            {diluted ? "held" : "granted"} is worth{" "}
            {formatValuation(Math.round(heldWorth), currency)}
            {diluted && ` — down from ${formatPct(granted)} originally granted`}.
          </p>
        </div>
      )}
    </section>
  );
}
