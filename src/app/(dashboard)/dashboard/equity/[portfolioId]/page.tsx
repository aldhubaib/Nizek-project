import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import {
  getEquityPortfolio,
  listEquityHolders,
  listEquityMetrics,
  listEquityRoles,
} from "@/actions/equity";
import { EquityPortfolioClient } from "./equity-portfolio-client";

export default async function EquityPortfolioPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const { portfolioId } = await params;
  const [portfolio, holders, roles, metrics] = await Promise.all([
    getEquityPortfolio(portfolioId),
    listEquityHolders(),
    listEquityRoles(),
    listEquityMetrics(),
  ]);
  if (!portfolio) notFound();

  return (
    <EquityPortfolioClient
      portfolio={portfolio}
      holders={holders}
      roles={roles}
      metrics={metrics}
    />
  );
}
