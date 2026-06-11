import { requireUser } from "@/lib/auth";
import { getClientDependencies, getUnreadMentions, getMyTasks, getDevQueue, getPmQueue, getShippedSummary } from "@/actions/dashboard";
import { ShippedSummary } from "@/components/dashboard/shipped-summary";
import { ClientDependencies } from "@/components/dashboard/client-dependencies";
import { UnreadMentions } from "@/components/dashboard/unread-mentions";
import { MyTasks } from "@/components/dashboard/my-tasks";
import { DevQueue } from "@/components/dashboard/dev-queue";
import { PmQueue } from "@/components/dashboard/pm-queue";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { LazyManagementTab } from "@/components/dashboard/lazy-management-tab";
import { LazyProductTab } from "@/components/dashboard/lazy-product-tab";
import { LazyDevTab } from "@/components/dashboard/lazy-dev-tab";

export default async function DashboardPage() {
  const user = await requireUser();
  const [clientDeps, unreadMentions, myTasks, devQueue, pmQueue, shippedData] = await Promise.all([
    getClientDependencies(),
    getUnreadMentions(),
    getMyTasks(),
    getDevQueue(),
    getPmQueue(),
    getShippedSummary(),
  ]);

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 pr-14 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </div>

      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground mb-6">
          Welcome back, {user.name || "there"}.
        </p>
        <DashboardTabs
          daily={
            <>
              <DevQueue data={JSON.parse(JSON.stringify(devQueue))} />
              <PmQueue data={JSON.parse(JSON.stringify(pmQueue))} />
              <MyTasks data={JSON.parse(JSON.stringify(myTasks))} />
              <UnreadMentions data={unreadMentions} />
              <ClientDependencies data={clientDeps} />
              <ShippedSummary data={shippedData} />
            </>
          }
          management={<LazyManagementTab />}
          product={<LazyProductTab />}
          dev={<LazyDevTab />}
        />
      </div>
    </div>
  );
}
