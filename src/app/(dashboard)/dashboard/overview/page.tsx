import { redirect } from "next/navigation";
import { getAuditAccess } from "@/actions/audit";
import { getManagerOverview } from "@/actions/overview";
import { OverviewClient } from "./overview-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const access = await getAuditAccess();
  if (!access.canAudit) redirect("/dashboard");

  const overview = await getManagerOverview();

  return <OverviewClient overview={overview} />;
}
