"use client";

import Link from "next/link";
import { isWithinInterval } from "date-fns";
import { FolderKanban } from "lucide-react";

interface Contract {
  id: string;
  contractType: string;
  startDate: Date;
  endDate: Date;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  contracts: Contract[];
  _count: { tasks: number; meetingNotes: number; assets: number; members: number };
}

const CONTRACT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  FULL_TEAM: { label: "Full Team", color: "text-primary bg-primary/10 border-primary/20" },
  PART_TEAM: { label: "Part Team", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  FIXED: { label: "Fixed", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  MAINTENANCE: { label: "Maintenance", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
};

interface Props {
  projects: Project[];
}

export function ProjectList({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-12">
        <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" />
        <p className="text-[13px] text-muted-foreground">
          No projects yet. Create your first one.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const now = new Date();
        const activeContract = project.contracts.find((c) =>
          isWithinInterval(now, {
            start: new Date(c.startDate),
            end: new Date(c.endDate),
          })
        );
        const isActive = !!activeContract;
        const contractType = activeContract?.contractType ?? project.contracts[0]?.contractType;

        return (
          <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
            <div className="rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors cursor-pointer h-full">
              <div className="flex items-start gap-3 mb-2">
                {project.logoUrl ? (
                  <img
                    src={project.logoUrl}
                    alt={project.name}
                    className="w-9 h-9 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="text-[13px] font-bold text-primary">
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-foreground truncate">
                      {project.name}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ml-2 ${
                        isActive
                          ? "bg-success/15 text-success border border-success/20"
                          : "bg-destructive/15 text-destructive border border-destructive/20"
                      }`}
                    >
                      {isActive ? "Active" : "Expired"}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {project.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {contractType && CONTRACT_TYPE_LABELS[contractType] && (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${CONTRACT_TYPE_LABELS[contractType].color}`}>
                    {CONTRACT_TYPE_LABELS[contractType].label}
                  </span>
                )}
                <span>{project._count.members} members</span>
                <span>{project._count.tasks} tasks</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
