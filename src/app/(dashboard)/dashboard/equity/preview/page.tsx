import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolios } from "@/actions/equity";
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
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
        <PageBackButton href="/dashboard/equity" label="Back to equity" />
        <PageBreadcrumb
          items={[
            { label: "Equity", href: "/dashboard/equity" },
            { label: "Report preview" },
          ]}
        />
        <EquityMenu />
      </PageHeader>

      <div className="px-app py-6 max-w-5xl mx-auto">
        {/* The report is designed on its own dark sheet, so the preview keeps
            that ground rather than borrowing the dashboard's — otherwise the
            colours are checked against a background they'll never print on. */}
        <div className="rounded-xl bg-card ring-1 ring-white/10 px-8 py-7">
          <header className="flex items-center justify-between gap-4">
            <Wordmark className="text-3xl" />
            <p className="text-xs text-white/40">
              {portfolios.length} project{portfolios.length === 1 ? "" : "s"}
            </p>
          </header>
          <h2 className="text-3xl font-bold text-white tracking-tight mt-3">
            Equity status report
          </h2>

          {portfolios.length === 0 ? (
            <p className="text-s text-white/40 mt-6">
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
