import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolios } from "@/actions/equity";
import {
  ACCENT,
  AllProjectsTable,
  PortfolioSection,
  PortfolioSummary,
  Wordmark,
} from "@/components/equity/report-design";
import { PrintButton } from "./print-button";
import { ReportVariantPicker } from "./report-variant-picker";
import { REPORT_VARIANT, parseReportVariant } from "./report-variant";

export const metadata = { title: "Equity status report" };

export default async function EquityReportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const { view } = await searchParams;
  const variant = parseReportVariant(view);
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
            <PortfolioSummary portfolios={portfolios} variant={variant} />

            <AllProjectsTable portfolios={portfolios} variant={variant} />

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
