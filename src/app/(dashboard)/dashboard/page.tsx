import { requireUser } from "@/lib/auth";
import { getContractsHealth, getLongestInPipeline, getMostRejectedTasks, getShippedSummary, getClientDependencies, getUnreadMentions, getTeamProjects, getMyTasks, getDevQueue, getPmQueue } from "@/actions/dashboard";
import { ContractsHealth } from "@/components/dashboard/contracts-health";
import { LongestInPipeline } from "@/components/dashboard/longest-in-pipeline";
import { MostRejected } from "@/components/dashboard/most-rejected";
import { ShippedSummary } from "@/components/dashboard/shipped-summary";
import { ClientDependencies } from "@/components/dashboard/client-dependencies";
import { UnreadMentions } from "@/components/dashboard/unread-mentions";
import { TeamProjects } from "@/components/dashboard/team-projects";
import { MyTasks } from "@/components/dashboard/my-tasks";
import { DevQueue } from "@/components/dashboard/dev-queue";
import { PmQueue } from "@/components/dashboard/pm-queue";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

export default async function DashboardPage() {
  const user = await requireUser();
  const [contractsHealth, pipelineTasks, rejectedTasks, shippedData, clientDeps, unreadMentions, teamProjects, myTasks, devQueue, pmQueue] = await Promise.all([
    getContractsHealth(),
    getLongestInPipeline(),
    getMostRejectedTasks(),
    getShippedSummary(),
    getClientDependencies(),
    getUnreadMentions(),
    getTeamProjects(),
    getMyTasks(),
    getDevQueue(),
    getPmQueue(),
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
          management={
            <>
              <ContractsHealth data={contractsHealth} />
              <TeamProjects data={JSON.parse(JSON.stringify(teamProjects))} />
              <LongestInPipeline data={pipelineTasks} />
              <MostRejected data={rejectedTasks} />
            </>
          }
        />
      </div>
    </div>
  );
}
