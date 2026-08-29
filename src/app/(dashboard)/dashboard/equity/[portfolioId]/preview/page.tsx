import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolio, listEquityMetrics } from "@/actions/equity";
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { PortfolioPitch } from "@/components/equity/portfolio-pitch";

/**
 * The project as a pitch rather than a set of tables — the Opportunity deck and
 * the equity behind it, drawn out and read in order.
 *
 * The printable report at /equity-report is the document you send; this is the
 * one you read on screen, so it trades page breaks for charts you can hover and
 * a rail to jump between sections.
 */
export default async function EquityPreviewPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const { portfolioId } = await params;
  const [portfolio, fields] = await Promise.all([
    getEquityPortfolio(portfolioId),
    listEquityMetrics(),
  ]);
  if (!portfolio) notFound();

  return (
    <div>
      <PageHeader hasMenu>
        <PageBackButton
          href={`/dashboard/equity/${portfolioId}`}
          label="Back to the portfolio"
        />
        <PageBreadcrumb
          items={[
            { label: "Equity", href: "/dashboard/equity" },
            {
              label: portfolio.project.name,
              href: `/dashboard/equity/${portfolioId}`,
            },
            { label: "Pitch preview" },
          ]}
        />
        {/* No actions menu here: the preview is for reading, and everything
            the menu does — including delete — belongs on the portfolio page. */}
      </PageHeader>

      <div className="px-app py-6 max-w-6xl mx-auto">
        <PortfolioPitch portfolio={portfolio} fields={fields} />
      </div>
    </div>
  );
}
