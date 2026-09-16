import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getWorkflowSettings, listWorkflowUsers } from "@/actions/workflow";
import { listModuleRoles } from "@/actions/workflow-role";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { DealSettingsClient } from "../deal-settings-client";

type Props = {
  searchParams: Promise<{ flow?: string }>;
};

export default async function DealBlueprintPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { flow } = await searchParams;
  const [settings, catalogs, users, roles] = await Promise.all([
    getWorkflowSettings("deal"),
    getAllLayoutCatalogs("deal"),
    listWorkflowUsers(),
    listModuleRoles("deal"),
  ]);

  return (
    <DealSettingsClient
      initial={settings}
      catalogs={catalogs}
      users={users}
      roles={roles}
      initialFlowId={flow}
    />
  );
}
