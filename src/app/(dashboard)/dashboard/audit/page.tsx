import { redirect } from "next/navigation";
import { getAuditAccess, listAuditReports } from "@/actions/audit";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const access = await getAuditAccess();
  if (!access.canAudit) redirect("/dashboard");

  const reports = await listAuditReports();

  return <AuditClient access={access} reports={reports} />;
}
