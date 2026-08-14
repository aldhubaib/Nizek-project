import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { redirect } from "next/navigation";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { LazyManagementTab } from "@/components/dashboard/lazy-management-tab";
import { LazyProductTab } from "@/components/dashboard/lazy-product-tab";
import { LazyDevTab } from "@/components/dashboard/lazy-dev-tab";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");

  return (
    <div>
      <div className="h-12 sticky top-0 z-10 flex items-center justify-between px-6 pr-14 border-b border-border bg-background shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </div>

      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground mb-6">
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
