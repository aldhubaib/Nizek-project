"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  getContractsHealth,
  getTeamProjects,
  getMostRejectedTasks,
  getProjectStageDistribution,
} from "@/actions/dashboard";
import { ContractsHealth } from "./contracts-health";
import { TeamProjects } from "./team-projects";
import { MostRejected } from "./most-rejected";
import { LazyIncompleteDeadlines } from "./lazy-incomplete-deadlines";
import { ProjectStageChart } from "./project-stage-chart";
import { OverallStageBar } from "./overall-stage-bar";

type ManagementData = {
  contractsHealth: Awaited<ReturnType<typeof getContractsHealth>>;
  teamProjects: Awaited<ReturnType<typeof getTeamProjects>>;
  rejectedTasks: Awaited<ReturnType<typeof getMostRejectedTasks>>;
  stageDistribution: Awaited<ReturnType<typeof getProjectStageDistribution>>;
};

export function LazyManagementTab() {
  const [data, setData] = useState<ManagementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [contractsHealth, teamProjects, rejectedTasks, stageDistribution] =
          await Promise.all([
            getContractsHealth(),
            getTeamProjects(),
            getMostRejectedTasks(),
            getProjectStageDistribution("all"),
          ]);
        setData({ contractsHealth, teamProjects, rejectedTasks, stageDistribution });
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
      {data.stageDistribution && (
        <>
          <div className="lg:col-span-2">
            <ProjectStageChart
              data={data.stageDistribution}
              className=""
              audienceNote="Management view — every active project, visible to Admins."
            />
          </div>
          <div className="lg:col-span-2">
            <OverallStageBar
              data={data.stageDistribution}
              className=""
              audienceNote="Management view — every active project, visible to Admins."
            />
          </div>
        </>
      )}
      <ContractsHealth data={data.contractsHealth} />
      <TeamProjects data={JSON.parse(JSON.stringify(data.teamProjects))} />
      <MostRejected data={data.rejectedTasks} />
      <LazyIncompleteDeadlines />
    </>
  );
}
