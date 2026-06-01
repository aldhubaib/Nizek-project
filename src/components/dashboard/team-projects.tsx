"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, FolderKanban, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FULL_TEAM: "Full Team",
  PART_TEAM: "Part Team",
  FIXED: "Fixed",
  MAINTENANCE: "Maintenance",
  STARTUP: "Startup",
};

interface ProjectItem {
  id: string;
  name: string;
  logoUrl: string | null;
  taskCount: number;
  memberCount: number;
  isActive: boolean;
  contractType: string | null;
}

interface TeamData {
  id: string;
  name: string;
  projectCount: number;
  activeCount: number;
  projects: ProjectItem[];
}

export function TeamProjects({ data }: { data: TeamData[] }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const totalProjects = data.reduce((s, t) => s + t.projectCount, 0);
  const totalActive = data.reduce((s, t) => s + t.activeCount, 0);

  const teamsWithProjects = data.filter((t) => t.projectCount > 0);
  const maxProjects = Math.max(...data.map((t) => t.projectCount), 1);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Teams
          </h2>
          <span className="text-[11px] text-muted-foreground font-mono">
            {data.length} teams
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{totalProjects} projects</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">{totalActive} active</span>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Users className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
          <p className="text-[12px] text-muted-foreground">No teams yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {data.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const barW = Math.max(4, (team.projectCount / maxProjects) * 100);

            return (
              <div key={team.id}>
                <button
                  onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-muted-foreground">
                    {team.projectCount > 0 ? (
                      isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("text-[12px] font-medium truncate", team.id === "__none__" && "text-muted-foreground italic")}>{team.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-bold tabular-nums text-foreground">
                          {team.projectCount}
                        </span>
                        {team.activeCount > 0 && (
                          <span className="text-[10px] text-emerald-400 font-medium">
                            {team.activeCount} active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${barW}%` }}
                      />
                    </div>
                  </div>
                </button>

                {isExpanded && team.projects.length > 0 && (
                  <div className="bg-accent/5 border-t border-border/30">
                    {team.projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/dashboard/projects/${project.id}`}
                        className="flex items-center gap-3 px-4 pl-12 py-2 hover:bg-accent/20 transition-colors group"
                      >
                        {project.logoUrl ? (
                          <img src={project.logoUrl} alt="" className="w-5 h-5 rounded object-cover border border-border shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                            {project.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium truncate group-hover:text-primary transition-colors block">
                            {project.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted-foreground">
                          {project.contractType && (
                            <span className="font-medium">{CONTRACT_TYPE_LABELS[project.contractType] ?? project.contractType}</span>
                          )}
                          <span className="tabular-nums">{project.taskCount} tasks</span>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            project.isActive ? "bg-emerald-500" : "bg-muted-foreground/30"
                          )} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
