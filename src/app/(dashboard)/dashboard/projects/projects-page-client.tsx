"use client";

import { useState, useMemo } from "react";
import { FolderKanban, Archive, Filter, X } from "lucide-react";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { ProjectCard } from "@/components/project/project-card";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  contractType: string;
  startDate: string | null;
  endDate: string | null;
  latePayment: boolean;
}

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  description?: string | null;
  logoUrl: string | null;
  team?: Team | null;
  _count: { members: number; tasks: number; meetingNotes: number; assets: number };
  contracts: Contract[];
}

const CONTRACT_TYPES: { id: string; label: string }[] = [
  { id: "FULL_TEAM", label: "Full Team" },
  { id: "PART_TEAM", label: "Part Team" },
  { id: "FIXED", label: "Fixed" },
  { id: "MAINTENANCE", label: "Maintenance" },
  { id: "STARTUP", label: "Startup" },
];

interface Props {
  projects: Project[];
  teams: Team[];
  contractPrefixes: ContractPrefixOption[];
}

export function ProjectsPageClient({ projects, teams, contractPrefixes }: Props) {
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [contractFilter, setContractFilter] = useState<string>("all");

  const usedTeams = useMemo(() => {
    const ids = new Set(projects.map((p) => p.team?.id).filter(Boolean));
    return teams.filter((t) => ids.has(t.id));
  }, [projects, teams]);

  const usedContractTypes = useMemo(() => {
    const types = new Set(projects.flatMap((p) => p.contracts.map((c) => c.contractType)));
    return CONTRACT_TYPES.filter((t) => types.has(t.id));
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (teamFilter !== "all") {
        if (teamFilter === "none") {
          if (p.team) return false;
        } else if (p.team?.id !== teamFilter) {
          return false;
        }
      }
      if (contractFilter !== "all") {
        const hasType = p.contracts.some((c) => c.contractType === contractFilter);
        if (!hasType) return false;
      }
      return true;
    });
  }, [projects, teamFilter, contractFilter]);

  const now = new Date();
  const isProjectActive = (p: Project) =>
    p.contracts.some((c) => {
      if (c.latePayment) return false;
      if (!c.startDate || !c.endDate) return false;
      const end = new Date(c.endDate);
      end.setHours(23, 59, 59, 999);
      return new Date(c.startDate) <= now && end >= now;
    });

  const activeProjects = filtered.filter(isProjectActive);
  const archivedProjects = filtered.filter((p) => !isProjectActive(p));

  const hasFilters = teamFilter !== "all" || contractFilter !== "all";

  return (
    <div>
      <div className="h-12 sticky top-0 z-10 flex items-center justify-between px-6 pr-14 border-b border-border bg-background shrink-0">
        <h1 className="text-sm font-semibold">Projects</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {filtered.length === projects.length
              ? `${projects.length} project${projects.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${projects.length}`}
          </span>
          <CreateProjectDialog teams={teams} contractPrefixes={contractPrefixes} />
        </div>
      </div>

      {/* Filters */}
      {projects.length > 0 && (
        <div className="px-6 pt-4 pb-1 flex items-center gap-3 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/60 font-medium">Team</span>
            <div className="flex items-center gap-1">
              <FilterChip
                active={teamFilter === "all"}
                onClick={() => setTeamFilter("all")}
                label="All"
              />
              {usedTeams.map((t) => (
                <FilterChip
                  key={t.id}
                  active={teamFilter === t.id}
                  onClick={() => setTeamFilter(teamFilter === t.id ? "all" : t.id)}
                  label={t.name}
                />
              ))}
              {projects.some((p) => !p.team) && (
                <FilterChip
                  active={teamFilter === "none"}
                  onClick={() => setTeamFilter(teamFilter === "none" ? "all" : "none")}
                  label="No Team"
                />
              )}
            </div>
          </div>

          <span className="text-border">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/60 font-medium">Contract</span>
            <div className="flex items-center gap-1">
              <FilterChip
                active={contractFilter === "all"}
                onClick={() => setContractFilter("all")}
                label="All"
              />
              {usedContractTypes.map((t) => (
                <FilterChip
                  key={t.id}
                  active={contractFilter === t.id}
                  onClick={() => setContractFilter(contractFilter === t.id ? "all" : t.id)}
                  label={t.label}
                />
              ))}
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setTeamFilter("all"); setContractFilter("all"); }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[calc(100vh-120px)]">
          <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">
            No projects yet. Create your first project.
          </p>
          <CreateProjectDialog teams={teams} contractPrefixes={contractPrefixes} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <Filter className="w-8 h-8 text-muted-foreground opacity-30" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">No projects match the current filters</p>
          <button
            onClick={() => { setTeamFilter("all"); setContractFilter("all"); }}
            className="text-[12px] text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="px-6 py-4">
          {activeProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeProjects.map((project) => (
                <ProjectCard key={project.id} project={project} teams={teams} contractPrefixes={contractPrefixes} />
              ))}
            </div>
          )}

          {activeProjects.length === 0 && archivedProjects.length > 0 && (
            <p className="text-[12px] text-muted-foreground/60 mb-6">
              No active projects match the filters.
            </p>
          )}

          {archivedProjects.length > 0 && (
            <div className={activeProjects.length > 0 ? "mt-10" : ""}>
              <div className="flex items-center gap-2 mb-4">
                <Archive className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.5} />
                <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Archive
                </h2>
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  {archivedProjects.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
                {archivedProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} teams={teams} contractPrefixes={contractPrefixes} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
        active
          ? "bg-primary/15 text-primary border-primary/30"
          : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
