import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { getEquityPortfolio } from "@/actions/equity";
import { EquityPortfolioClient } from "./equity-portfolio-client";

export default async function EquityPortfolioPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const { portfolioId } = await params;
  const portfolio = await getEquityPortfolio(portfolioId);
  if (!portfolio) notFound();

  return <EquityPortfolioClient portfolio={portfolio} />;
}
