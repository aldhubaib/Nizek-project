"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { FolderKanban, Archive, Filter, X, ChevronDown, Check } from "lucide-react";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { ProjectCard } from "@/components/project/project-card";
import { cn } from "@/lib/utils";
import { PageHeader, PageName } from "@/components/page-header";

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

interface Props {
  projects: Project[];
  teams: Team[];
  contractPrefixes: ContractPrefixOption[];
}

export function ProjectsPageClient({ projects, teams, contractPrefixes }: Props) {
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const usedTeams = useMemo(() => {
    const ids = new Set(projects.map((p) => p.team?.id).filter(Boolean));
    return teams.filter((t) => ids.has(t.id));
  }, [projects, teams]);

  function toggleTeam(id: string) {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (selectedTeams.size === 0) return projects;
    return projects.filter((p) => {
      const tid = p.team?.id;
      return tid ? selectedTeams.has(tid) : false;
    });
  }, [projects, selectedTeams]);

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

  const hasFilters = selectedTeams.size > 0;

  const dropdownLabel = useMemo(() => {
    if (selectedTeams.size === 0) return "All teams";
    if (selectedTeams.size === 1) {
      const t = usedTeams.find((t) => selectedTeams.has(t.id));
      return t?.name ?? "1 team";
    }
    return `${selectedTeams.size} teams`;
  }, [selectedTeams, usedTeams]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader className="justify-between">
        <PageName>Projects</PageName>
        <CreateProjectDialog teams={teams} contractPrefixes={contractPrefixes} />
      </PageHeader>

      {projects.length > 0 && usedTeams.length > 1 && (
        <div className="px-app pt-l pb-xs flex items-center gap-m flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-s py-xs text-xs font-medium transition-colors",
                hasFilters
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {dropdownLabel}
              <ChevronDown className={cn("size-3 transition-transform", dropdownOpen && "rotate-180")} />
            </button>

            {dropdownOpen && (
              <div className="absolute start-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-border bg-popover p-1 shadow-lg">
                {usedTeams.map((t) => {
                  const selected = selectedTeams.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTeam(t.id)}
                      className={cn(
                        "flex w-full items-center gap-s rounded-md px-s py-xs text-xs transition-colors",
                        selected
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}>
                        {selected && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                      {t.name}
                    </button>
                  );
                })}
                {hasFilters && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => { setSelectedTeams(new Set()); setDropdownOpen(false); }}
                      className="flex w-full items-center gap-s rounded-md px-s py-xs text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="size-3" />
                      Clear filter
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {hasFilters && (
            <button
              onClick={() => setSelectedTeams(new Set())}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center gap-m">
          <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">
            No projects yet. Create your first project.
          </p>
          <CreateProjectDialog teams={teams} contractPrefixes={contractPrefixes} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-m py-xl">
          <Filter className="w-8 h-8 text-muted-foreground opacity-30" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">No projects match the current filters</p>
          <button
            onClick={() => setSelectedTeams(new Set())}
            className="text-s text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="px-app py-l">
          {activeProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-card">
              {activeProjects.map((project) => (
                <ProjectCard key={project.id} project={project} teams={teams} contractPrefixes={contractPrefixes} />
              ))}
            </div>
          )}

          {activeProjects.length === 0 && archivedProjects.length > 0 && (
            <p className="text-s text-muted-foreground/60 mb-6">
              No active projects match the filters.
            </p>
          )}

          {archivedProjects.length > 0 && (
            <div className={activeProjects.length > 0 ? "mt-xl pt-xl" : ""}>
              <div className="flex items-center gap-s mb-l">
                <Archive className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.5} />
                <h2 className="text-s font-semibold text-muted-foreground uppercase tracking-wider">
                  Archive
                </h2>
                <span className="text-xs text-muted-foreground/50 font-mono">
                  {archivedProjects.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-card opacity-60">
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

