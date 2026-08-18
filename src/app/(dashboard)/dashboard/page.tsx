import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { redirect } from "next/navigation";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { LazyManagementTab } from "@/components/dashboard/lazy-management-tab";
import { LazyProductTab } from "@/components/dashboard/lazy-product-tab";
import { LazyDevTab } from "@/components/dashboard/lazy-dev-tab";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");

  return (
    <div>
      <PageHeader>
        <h1 className="text-s font-semibold">Dashboard</h1>
      </PageHeader>

      <div className="px-app py-6">
        <p className="text-s text-muted-foreground mb-6">
          Welcome back, {user.name || "there"}.
        </p>
        <DashboardTabs
          dashboard={<DashboardOverview />}
          management={<LazyManagementTab />}
          product={<LazyProductTab />}
          dev={<LazyDevTab />}
        />
      </div>
    </div>
  );
}
