"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  getStageFunnel,
  getContractsHealth,
  getTeamProjects,
  getMostRejectedTasks,
} from "@/actions/dashboard";
import { StageFunnel } from "./stage-funnel";
import { ContractsHealth } from "./contracts-health";
import { TeamProjects } from "./team-projects";
import { MostRejected } from "./most-rejected";

type ManagementData = {
  funnelData: Awaited<ReturnType<typeof getStageFunnel>>;
  contractsHealth: Awaited<ReturnType<typeof getContractsHealth>>;
  teamProjects: Awaited<ReturnType<typeof getTeamProjects>>;
  rejectedTasks: Awaited<ReturnType<typeof getMostRejectedTasks>>;
};

export function LazyManagementTab() {
  const [data, setData] = useState<ManagementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [funnelData, contractsHealth, teamProjects, rejectedTasks] =
          await Promise.all([
            getStageFunnel(),
            getContractsHealth(),
            getTeamProjects(),
            getMostRejectedTasks(),
          ]);
        setData({ funnelData, contractsHealth, teamProjects, rejectedTasks });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load management data");
      }
    });
  }, []);

  if (isPending || !data) {
    if (error) {
      return (
        <div className="col-span-full flex items-center justify-center py-12 text-[13px] text-destructive">
          {error}
        </div>
      );
    }
    return (
      <div className="col-span-full flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <StageFunnel data={JSON.parse(JSON.stringify(data.funnelData))} />
      <ContractsHealth data={data.contractsHealth} />
      <TeamProjects data={JSON.parse(JSON.stringify(data.teamProjects))} />
      <MostRejected data={data.rejectedTasks} />
    </>
  );
}
