import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolios } from "@/actions/equity";
import { PageHeader } from "@/components/page-header";
import { EquityMenu } from "@/components/equity/equity-menu";
import {
  AllProjectsTable,
  PortfolioSection,
  PortfolioSummary,
  Wordmark,
} from "@/components/equity/report-design";

/**
 * The whole equity report, read inside the dashboard instead of on a printable
 * sheet. It's the report's own components, so this is what will actually print
 * — the point is to check it before sending it, without generating a document.
 *
 * Always the internal view; the investor cut is a property of the report you
 * send, and both cuts print from the report itself.
 */
export default async function EquityPreviewPage() {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const portfolios = await getEquityPortfolios();

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
        <h1 className="text-sm font-semibold text-foreground flex-1">
          Report preview
        </h1>
        <EquityMenu />
      </PageHeader>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        {/* The report is designed on its own dark sheet, so the preview keeps
            that ground rather than borrowing the dashboard's — otherwise the
            colours are checked against a background they'll never print on. */}
        <div className="rounded-xl bg-[#0a0a0a] ring-1 ring-white/10 px-8 py-7">
          <header className="flex items-center justify-between gap-4">
            <Wordmark className="text-[22px]" />
            <p className="text-[10px] text-white/40">
              {portfolios.length} project{portfolios.length === 1 ? "" : "s"}
            </p>
          </header>
          <h2 className="text-[22px] font-bold text-white tracking-tight mt-3">
            Equity status report
          </h2>

          {portfolios.length === 0 ? (
            <p className="text-[12px] text-white/40 mt-6">
              No equity portfolios yet.
            </p>
          ) : (
            <>
              <PortfolioSummary portfolios={portfolios} variant="nizek" />
              <AllProjectsTable portfolios={portfolios} variant="nizek" />
              {portfolios.map((p) => (
                <PortfolioSection key={p.id} portfolio={p} variant="nizek" />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
