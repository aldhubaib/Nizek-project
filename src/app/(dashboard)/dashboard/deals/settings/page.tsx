import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listWorkflows } from "@/actions/workflow";
import { listFormLayouts } from "@/actions/custom-field";
import { DealSettingsHub } from "./deal-settings-hub";

export default async function DealSettingsPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const [flows, layouts] = await Promise.all([
    listWorkflows("deal"),
    listFormLayouts("deal"),
  ]);

  return <DealSettingsHub flows={flows} layouts={layouts} />;
}
