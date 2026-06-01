import { requireUser } from "@/lib/auth";
import { getContractsHealth, getLongestInPipeline, getMostRejectedTasks, getShippedSummary, getClientDependencies, getUnreadMentions, getTeamProjects, getMyTasks } from "@/actions/dashboard";
import { ContractsHealth } from "@/components/dashboard/contracts-health";
import { LongestInPipeline } from "@/components/dashboard/longest-in-pipeline";
import { MostRejected } from "@/components/dashboard/most-rejected";
import { ShippedSummary } from "@/components/dashboard/shipped-summary";
import { ClientDependencies } from "@/components/dashboard/client-dependencies";
import { UnreadMentions } from "@/components/dashboard/unread-mentions";
import { TeamProjects } from "@/components/dashboard/team-projects";
import { MyTasks } from "@/components/dashboard/my-tasks";

export default async function DashboardPage() {
  const user = await requireUser();
  const [contractsHealth, pipelineTasks, rejectedTasks, shippedData, clientDeps, unreadMentions, teamProjects, myTasks] = await Promise.all([
    getContractsHealth(),
    getLongestInPipeline(),
    getMostRejectedTasks(),
    getShippedSummary(),
    getClientDependencies(),
    getUnreadMentions(),
    getTeamProjects(),
    getMyTasks(),
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MyTasks data={JSON.parse(JSON.stringify(myTasks))} />
          <UnreadMentions data={unreadMentions} />
          <ContractsHealth data={contractsHealth} />
          <TeamProjects data={JSON.parse(JSON.stringify(teamProjects))} />
          <LongestInPipeline data={pipelineTasks} />
          <MostRejected data={rejectedTasks} />
          <ClientDependencies data={clientDeps} />
          <ShippedSummary data={shippedData} />
        </div>
      </div>
    </div>
  );
}
