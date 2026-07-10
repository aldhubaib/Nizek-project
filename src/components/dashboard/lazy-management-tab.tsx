"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  getContractsHealth,
  getTeamProjects,
  getMostRejectedTasks,
} from "@/actions/dashboard";
import { ContractsHealth } from "./contracts-health";
import { TeamProjects } from "./team-projects";
import { MostRejected } from "./most-rejected";
import { LazyIncompleteDeadlines } from "./lazy-incomplete-deadlines";

type ManagementData = {
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
        const [contractsHealth, teamProjects, rejectedTasks] =
          await Promise.all([
            getContractsHealth(),
            getTeamProjects(),
            getMostRejectedTasks(),
          ]);
        setData({ contractsHealth, teamProjects, rejectedTasks });
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
      <ContractsHealth data={data.contractsHealth} />
      <TeamProjects data={JSON.parse(JSON.stringify(data.teamProjects))} />
      <MostRejected data={data.rejectedTasks} />
      <LazyIncompleteDeadlines />
    </>
  );
}
