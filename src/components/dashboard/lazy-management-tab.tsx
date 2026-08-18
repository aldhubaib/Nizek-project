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
  // Selected team ids; empty means "All". "__none__" = projects without a team.
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
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

  // Everything below is filtered client-side so switching teams is instant.
  // Multiple teams can be selected at once; an empty selection means "All".
  const matchesTeam = useMemo(() => {
    return (teamId: string | null) =>
      teamFilter.length === 0 ||
      teamFilter.some((f) => (f === "__none__" ? teamId === null : teamId === f));
  }, [teamFilter]);

  const filtered = useMemo(() => {
    if (!data) return null;
    return {
      contractsHealth: data.contractsHealth.filter((p) => matchesTeam(p.teamId)),
      teamProjects:
        teamFilter.length === 0
          ? data.teamProjects
          : data.teamProjects.filter((t) => teamFilter.includes(t.id)),
      rejectedTasks: data.rejectedTasks.filter((t) => matchesTeam(t.task.project.teamId)),
      stageDistribution: data.stageDistribution
        ? { projects: data.stageDistribution.projects.filter((p) => matchesTeam(p.teamId)) }
        : null,
    };
  }, [data, teamFilter, matchesTeam]);

  if (isPending || !data || !filtered) {
    if (error) {
      return (
        <div className="col-span-full flex items-center justify-center py-12 text-s text-destructive">
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

  const teamOptions = data.teamProjects.map((t) => ({ id: t.id, name: t.name }));

  function toggleTeam(id: string) {
    setTeamFilter((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  return (
    <>
      {/* Team filter — applies to every module below. Click to toggle;
          multiple teams can be active at once, "All" clears the selection. */}
      <div className="lg:col-span-2 flex items-center gap-1.5 flex-wrap">
        <Users className="w-3.5 h-3.5 text-muted-foreground/60 me-1" strokeWidth={1.5} />
        <button
          onClick={() => setTeamFilter([])}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            teamFilter.length === 0
              ? "bg-primary/15 border-primary/40 text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
          )}
        >
          All
        </button>
        {teamOptions.map((team) => (
          <button
            key={team.id}
            onClick={() => toggleTeam(team.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              teamFilter.includes(team.id)
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
