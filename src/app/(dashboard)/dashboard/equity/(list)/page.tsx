import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import {
  getEquityPortfolios,
  getEquityProjectOptions,
  listEquityHolders,
  listEquityMetrics,
  listEquityRoles,
} from "@/actions/equity";
import { getCurrencyRates } from "@/actions/currency-rates";
import { EquityPageClient } from "../equity-page-client";

export default async function EquityPage() {
  const user = await requireUser();
  if (!(await canAccessEquity(user.id))) redirect("/dashboard");

  const [portfolios, projectOptions, holders, roles, metrics, rates] = await Promise.all([
    getEquityPortfolios(),
    getEquityProjectOptions(),
    listEquityHolders(),
    listEquityRoles(),
    listEquityMetrics(),
    getCurrencyRates(),
  ]);

  return (
    <EquityPageClient
      portfolios={portfolios}
      projectOptions={projectOptions}
      holders={holders}
      roles={roles}
      metrics={metrics}
      rates={rates}
    />
  );
}
