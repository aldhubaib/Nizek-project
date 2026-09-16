import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { WorkflowRolesManager } from "@/components/workflow/workflow-roles-manager";

export default async function DealRolesPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  return (
    <WorkflowRolesManager
      entityType="deal"
      backHref="/dashboard/deals/settings"
      backLabel="Back to settings"
      title="Deal roles"
    />
  );
}
