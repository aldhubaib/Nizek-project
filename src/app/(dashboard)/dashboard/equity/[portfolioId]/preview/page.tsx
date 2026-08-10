import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolio, listEquityMetrics } from "@/actions/equity";
import { PageHeader } from "@/components/page-header";
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
        <Link
          href={`/dashboard/equity/${portfolioId}`}
          aria-label="Back to the portfolio"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors no-underline shrink-0"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        </Link>
        <h1 className="text-sm font-semibold text-foreground truncate">
          {portfolio.project.name}
        </h1>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          Pitch preview
        </span>
        {/* No actions menu here: the preview is for reading, and everything
            the menu does — including delete — belongs on the portfolio page. */}
      </PageHeader>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        <PortfolioPitch portfolio={portfolio} fields={fields} />
      </div>
    </div>
  );
}
