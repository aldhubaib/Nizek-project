import { requireUser } from "@/lib/auth";
import { getContractsHealth, getLongestInPipeline, getMostRejectedTasks, getShippedSummary } from "@/actions/dashboard";
import { ContractsHealth } from "@/components/dashboard/contracts-health";
import { LongestInPipeline } from "@/components/dashboard/longest-in-pipeline";
import { MostRejected } from "@/components/dashboard/most-rejected";
import { ShippedSummary } from "@/components/dashboard/shipped-summary";

export default async function DashboardPage() {
  const user = await requireUser();
  const [contractsHealth, pipelineTasks, rejectedTasks, shippedData] = await Promise.all([
    getContractsHealth(),
    getLongestInPipeline(),
    getMostRejectedTasks(),
    getShippedSummary(),
  ]);

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </div>

      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground mb-6">
          Welcome back, {user.name || "there"}.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ContractsHealth data={contractsHealth} />
          <LongestInPipeline data={pipelineTasks} />
          <MostRejected data={rejectedTasks} />
          <ShippedSummary data={shippedData} />
        </div>
      </div>
    </div>
  );
}
