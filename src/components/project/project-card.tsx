"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Settings } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { ProjectSettingsOverlay } from "@/components/project/project-settings-overlay";

interface Team {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  contractType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  latePayment: boolean;
}

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    logoUrl: string | null;
    team?: Team | null;
    _count: { members: number; tasks: number };
    contracts: Contract[];
  };
  teams?: Team[];
  contractPrefixes?: ContractPrefixOption[];
}

export function ProjectCard({ project, teams = [], contractPrefixes = [] }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const now = new Date();
  const endOfDay = (d: Date | string) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
  const hasValidContract = project.contracts.some((c) => {
    if (!c.startDate || !c.endDate) return false;
    return new Date(c.startDate) <= now && endOfDay(c.endDate) >= now;
  });
  const hasLatePayment = project.contracts.some((c) => c.latePayment &&
    c.startDate && c.endDate && new Date(c.startDate) <= now && endOfDay(c.endDate) >= now
  );
  const isActive = hasValidContract && !hasLatePayment;

  return (
    <>
      <div className="relative group">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="app-card block rounded-lg bg-card border border-border p-card hover:border-muted-foreground/20 transition-colors no-underline"
        >
          <div className="flex items-center gap-s mb-card">
            {project.logoUrl ? (
              <img src={project.logoUrl} alt={project.name} className="w-8 h-8 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary">
                {project.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-s font-semibold text-foreground truncate">
                {project.name}
              </p>
            </div>
            {!isActive && (
              <StatusBadge
                config={
                  hasLatePayment
                    ? outlineBadge("Late Payment", "text-orange", "border-orange/30")
                    : outlineBadge("Expired", "text-destructive", "border-destructive/30")
                }
              />
            )}
          </div>
          <div className="flex items-center gap-card text-xs text-muted-foreground">
            {project.team && <span className="font-medium text-muted-foreground/80">{project.team.name}</span>}
            <span>{project._count.members} members</span>
            <span>{project._count.tasks} tasks</span>
          </div>
        </Link>

        <div className="absolute top-3 right-3">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-popover shadow-xl py-1">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); setSettingsOpen(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-s text-foreground hover:bg-accent transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                  Settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {settingsOpen && createPortal(
        <ProjectSettingsOverlay
          project={project}
          teams={teams}
          contractPrefixes={contractPrefixes}
          isAdmin
          onClose={() => { setSettingsOpen(false); router.refresh(); }}
        />,
        document.body
      )}
    </>
  );
}
