import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getWorkflowSettings } from "@/actions/workflow";
import { listFormLayouts } from "@/actions/custom-field";
import { DealFlowsClient } from "./deal-flows-client";

export default async function DealFlowsPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const [settings, layouts] = await Promise.all([
    getWorkflowSettings("deal"),
    listFormLayouts("deal"),
  ]);
  return <DealFlowsClient initial={settings.workflows} layouts={layouts} />;
}
