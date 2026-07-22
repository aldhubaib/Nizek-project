import { redirect, notFound } from "next/navigation";
import { getAuditAccess, getAuditReport } from "@/actions/audit";
import { ReportClient } from "./report-client";

export const dynamic = "force-dynamic";

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;

  const access = await getAuditAccess();
  if (!access.canAudit) redirect("/dashboard");

  const report = await getAuditReport(auditId);
  if (!report) notFound();

  return <ReportClient report={report} />;
}
