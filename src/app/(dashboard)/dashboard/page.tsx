import { requireUser } from "@/lib/auth";
import { getContractsHealth } from "@/actions/dashboard";
import { ContractsHealth } from "@/components/dashboard/contracts-health";

export default async function DashboardPage() {
  const user = await requireUser();
  const contractsHealth = await getContractsHealth();

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-5xl">
        <p className="text-[13px] text-muted-foreground">
          Welcome back, {user.name || "there"}.
        </p>
        <ContractsHealth data={contractsHealth} />
      </div>
    </div>
  );
}
