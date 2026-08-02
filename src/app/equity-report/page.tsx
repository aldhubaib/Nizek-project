import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolios, type EquityPortfolioDTO } from "@/actions/equity";
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

export const metadata = { title: "Equity status report" };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-300 rounded px-2.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="text-[13px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const thCls = "py-1 pr-3 font-medium text-neutral-500";
const tdCls = "py-1 pr-3 align-top";

function PortfolioSection({ portfolio }: { portfolio: EquityPortfolioDTO }) {
  const currency = portfolio.valuationCurrency;
  const { granted, vested } = computePortfolioEquity(portfolio);
  const current = valuationAsOf(portfolio.valuations);
  const grantedWorth = equityValueAt(granted, current?.amount ?? null);
  const vestedWorth = equityValueAt(vested, current?.amount ?? null);

  return (
    <section className="mb-7 break-inside-avoid">
      <h2 className="text-[15px] font-semibold border-b border-neutral-400 pb-1 mb-2.5">
        {portfolio.project.name}
      </h2>

      <div className="grid grid-cols-4 gap-2 mb-3.5">
        <Stat label="Total equity" value={formatPct(granted)} />
        <Stat label="Vested today" value={formatPct(vested)} />
        <Stat
          label="Current valuation"
          value={current ? formatValuation(current.amount, currency) : "—"}
        />
        <Stat
          label="Vested worth"
          value={
            vestedWorth != null
              ? formatValuation(Math.round(vestedWorth), currency)
              : "—"
          }
        />
      </div>

      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
        Contracts
      </h3>
      {portfolio.contracts.length === 0 ? (
        <p className="text-[12px] text-neutral-500 mb-3.5">
          No contracts recorded.
        </p>
      ) : (
        <table className="w-full text-[12px] border-collapse mb-3.5">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className={thCls}>Contract</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Term</th>
              <th className={thCls}>Length</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.contracts.map((c, i) => (
              <tr key={c.id} className="border-b border-neutral-200">
                <td className={tdCls}>{c.title || `Contract ${i + 1}`}</td>
                <td className={tdCls}>
                  {c.signed ? "Signed" : "Not signed"}
                </td>
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

      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
        Equity
      </h3>
      {portfolio.grants.length === 0 ? (
        <p className="text-[12px] text-neutral-500">No equity defined yet.</p>
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
              className="border border-neutral-300 rounded px-2.5 py-2 mb-1.5 break-inside-avoid"
            >
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="font-medium">
                  {contractLabel(portfolio.contracts, g.contractId)}
                  <span className="text-neutral-500 font-normal">
                    {" · "}
                    {equityLabel(EQUITY_STRUCTURE, g.structureType)}
                    {g.structureType === "DIVIDEND" &&
                      ` · ${equityLabel(
                        EQUITY_FREQUENCY,
                        g.dividendFrequency
                      )} dividends`}
                  </span>
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {formatPct(g.equityPct)} granted
                  {grantVested != null && ` · ${formatPct(grantVested)} vested`}
                </span>
              </div>

              {g.tranches.length > 0 && (
                <table className="w-full text-[11px] border-collapse mt-1.5">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left">
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
                <p className="text-[11px] text-neutral-600 mt-1 whitespace-pre-wrap">
                  {g.notes}
                </p>
              )}
            </div>
          );
        })
      )}

      {current && grantedWorth != null && (
        <p className="text-[11px] text-neutral-600 mt-2">
          At {formatValuation(current.amount, currency)}, {formatPct(granted)}{" "}
          granted is worth {formatValuation(Math.round(grantedWorth), currency)}
          .
        </p>
      )}
    </section>
  );
}

export default async function EquityReportPage() {
  const user = await requireUser();
  if (!canAccessEquity(user)) redirect("/dashboard");

  const portfolios = await getEquityPortfolios();
  const generatedAt = new Date();

  return (
    <div className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      {/* The app is dark-themed; the report is its own light document so it
          prints legibly without relying on background graphics. */}
      <style>{`
        @page { margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto w-[210mm] max-w-full bg-white text-neutral-900 px-10 py-8 shadow print:w-full print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-400 pb-3 mb-6">
          <div>
            <h1 className="text-[18px] font-semibold">Equity status report</h1>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {portfolios.length} project
              {portfolios.length === 1 ? "" : "s"} · generated{" "}
              {generatedAt.toLocaleString()}
            </p>
          </div>
          <PrintButton />
        </header>

        {portfolios.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            No equity portfolios yet.
          </p>
        ) : (
          <>
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              All projects
            </h2>
            <table className="w-full text-[12px] border-collapse mb-8">
              <thead>
                <tr className="border-b border-neutral-400 text-left">
                  <th className={thCls}>Project</th>
                  <th className={thCls}>Equity</th>
                  <th className={thCls}>Vested</th>
                  <th className={thCls}>Contracts</th>
                  <th className={thCls}>Signed</th>
                  <th className={thCls}>Valuation</th>
                </tr>
              </thead>
              <tbody>
                {portfolios.map((p) => {
                  const { granted, vested } = computePortfolioEquity(p);
                  const current = valuationAsOf(p.valuations);
                  return (
                    <tr key={p.id} className="border-b border-neutral-200">
                      <td className={tdCls}>{p.project.name}</td>
                      <td className={tdCls}>{formatPct(granted)}</td>
                      <td className={tdCls}>{formatPct(vested)}</td>
                      <td className={tdCls}>{p.contracts.length || "—"}</td>
                      <td className={tdCls}>
                        {p.contracts.filter((c) => c.signed).length || "—"}
                      </td>
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

            {portfolios.map((p) => (
              <PortfolioSection key={p.id} portfolio={p} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
