"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Users } from "lucide-react";
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
import { cn } from "@/lib/utils";

type ManagementData = {
  contractsHealth: Awaited<ReturnType<typeof getContractsHealth>>;
  teamProjects: Awaited<ReturnType<typeof getTeamProjects>>;
  rejectedTasks: Awaited<ReturnType<typeof getMostRejectedTasks>>;
  stageDistribution: Awaited<ReturnType<typeof getProjectStageDistribution>>;
};

export function LazyManagementTab() {
  const [data, setData] = useState<ManagementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("all");
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

  // "all" | team id | "__none__" (projects without a team). Everything below is
  // filtered client-side so switching teams is instant.
  const matchesTeam = useMemo(() => {
    return (teamId: string | null) =>
      teamFilter === "all" ||
      (teamFilter === "__none__" ? teamId === null : teamId === teamFilter);
  }, [teamFilter]);

  const filtered = useMemo(() => {
    if (!data) return null;
    return {
      contractsHealth: data.contractsHealth.filter((p) => matchesTeam(p.teamId)),
      teamProjects:
        teamFilter === "all"
          ? data.teamProjects
          : data.teamProjects.filter((t) => t.id === teamFilter),
      rejectedTasks: data.rejectedTasks.filter((t) => matchesTeam(t.task.project.teamId)),
      stageDistribution: data.stageDistribution
        ? { projects: data.stageDistribution.projects.filter((p) => matchesTeam(p.teamId)) }
        : null,
    };
  }, [data, teamFilter, matchesTeam]);

  if (isPending || !data || !filtered) {
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

  const teamOptions = [
    { id: "all", name: "All" },
    ...data.teamProjects.map((t) => ({ id: t.id, name: t.name })),
  ];

  return (
    <>
      {/* Team filter — applies to every module below */}
      <div className="lg:col-span-2 flex items-center gap-1.5 flex-wrap">
        <Users className="w-3.5 h-3.5 text-muted-foreground/60 mr-1" strokeWidth={1.5} />
        {teamOptions.map((team) => (
          <button
            key={team.id}
            onClick={() => setTeamFilter(team.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              teamFilter === team.id
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
            )}
          >
            {team.name}
          </button>
        ))}
      </div>

      {filtered.stageDistribution && (
        <>
          <div className="lg:col-span-2">
            <ProjectStageChart
              data={filtered.stageDistribution}
              className=""
              audienceNote="Management view — every active project, filterable by team. Visible to Admins, PMs and Tech Leads."
            />
          </div>
          <div className="lg:col-span-2">
            <OverallStageBar
              data={filtered.stageDistribution}
              className=""
              audienceNote="Management view — every active project, filterable by team. Visible to Admins, PMs and Tech Leads."
            />
          </div>
        </>
      )}
      <ContractsHealth data={filtered.contractsHealth} />
      <TeamProjects data={JSON.parse(JSON.stringify(filtered.teamProjects))} />
      <MostRejected data={filtered.rejectedTasks} />
      <LazyIncompleteDeadlines teamFilter={teamFilter} />
    </>
  );
}
