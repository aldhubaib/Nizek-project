import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { redirect } from "next/navigation";
import { PageHeader, PageName } from "@/components/page-header";

export default async function DashboardPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");

  return (
    <div>
      <PageHeader>
        <PageName>Dashboard</PageName>
      </PageHeader>

      <div className="px-app py-6">
        <p className="text-s text-muted-foreground">
          Welcome back, {user.name || "there"}.
        </p>
      </div>
    </div>
  );
}
