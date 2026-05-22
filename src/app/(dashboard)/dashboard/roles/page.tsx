import { getRoles } from "@/actions/role";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RolesManager } from "@/components/settings/roles-manager";

export default async function RolesPage() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") redirect("/dashboard");

  const roles = await getRoles();

  return (
    <div>
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Roles</h1>
      </div>
      <div className="px-6 py-6 max-w-3xl">
        <RolesManager roles={roles} />
      </div>
    </div>
  );
}
