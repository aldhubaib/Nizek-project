"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  data: {
    stages: string[];
    totals: Record<string, number>;
    byProject: Record<string, Record<string, number>>;
    projects: { id: string; name: string }[];
    totalTasks: number;
  };
}

const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
  NEW_REQUEST:       { label: "New Request",       color: "bg-zinc-500",    bg: "bg-zinc-500/15" },
  SPEC_READY:        { label: "Spec Ready",        color: "bg-violet-400",  bg: "bg-violet-400/15" },
  NEEDS_INPUT:       { label: "Needs Input",       color: "bg-rose-500",    bg: "bg-rose-500/15" },
  READY_FOR_DEV:     { label: "Ready for Dev",     color: "bg-blue-500",    bg: "bg-blue-500/15" },
  IN_DEVELOPMENT:    { label: "In Development",    color: "bg-sky-500",     bg: "bg-sky-500/15" },
  INTERNAL_REVIEW:   { label: "Internal Review",   color: "bg-amber-500",   bg: "bg-amber-500/15" },
  CLIENT_REVIEW:     { label: "Client Review",     color: "bg-orange-500",  bg: "bg-orange-500/15" },
  READY_FOR_RELEASE: { label: "Ready for Release", color: "bg-teal-500",    bg: "bg-teal-500/15" },
  DONE:              { label: "Done",              color: "bg-emerald-500", bg: "bg-emerald-500/15" },
};

export function StageFunnel({ data }: Props) {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const counts = data.stages.map((stage) => {
    if (selectedProjects.length === 0) return data.totals[stage] ?? 0;
    return selectedProjects.reduce((sum, pid) => sum + (data.byProject[pid]?.[stage] ?? 0), 0);
  });

  const total = counts.reduce((s, c) => s + c, 0);
  const max = Math.max(...counts, 1);

  function toggleProject(pid: string) {
    setSelectedProjects((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-[13px] font-semibold text-foreground">Project Funnel</h2>
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
            {total}
          </span>
        </div>
        <div className="relative">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors",
              selectedProjects.length > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            )}
          >
            <Filter className="w-3 h-3" />
            {selectedProjects.length > 0
              ? `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""}`
              : "All projects"}
            <ChevronDown className={cn("w-3 h-3 transition-transform", filterOpen && "rotate-180")} />
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-popover shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">Filter by project</span>
                {selectedProjects.length > 0 && (
                  <button
                    onClick={() => setSelectedProjects([])}
                    className="text-[10px] text-primary hover:text-primary/80 font-medium"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-[240px] overflow-y-auto py-1">
                {data.projects.map((p) => {
                  const active = selectedProjects.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/30"
                      )}
                    >
                      <div className={cn(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                        active ? "bg-primary border-primary" : "border-border"
                      )}>
                        {active && <span className="text-[8px] text-primary-foreground font-bold">✓</span>}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedProjects.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50 bg-muted/30 flex-wrap">
          {selectedProjects.map((pid) => {
            const proj = data.projects.find((p) => p.id === pid);
            return (
              <span key={pid} className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5 border border-primary/20">
                {proj?.name ?? pid}
                <button onClick={() => toggleProject(pid)} className="hover:text-primary/60">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="px-4 py-4 space-y-2.5">
        {data.stages.map((stage, i) => {
          const count = counts[i];
          const meta = STAGE_META[stage] ?? { label: stage, color: "bg-muted", bg: "bg-muted/15" };
          const pct = max > 0 ? (count / max) * 100 : 0;

          return (
            <div key={stage} className="group">
              <div className="flex items-center gap-3">
                <div className="w-[120px] shrink-0 flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", meta.color)} />
                  <span className="text-[11px] font-medium text-muted-foreground truncate">
                    {meta.label}
                  </span>
                </div>
                <div className="flex-1 h-7 rounded-md overflow-hidden bg-muted/30 relative">
                  <div
                    className={cn("h-full rounded-md transition-all duration-500 ease-out", meta.color, "opacity-80")}
                    style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-foreground shrink-0">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {total > 0 && (
            <>
              <span className="font-semibold text-emerald-400">{counts[counts.length - 1]}</span>
              <span className="text-muted-foreground/60"> / {total} done</span>
              <span className="text-muted-foreground/40 ml-1.5">
                ({total > 0 ? Math.round((counts[counts.length - 1] / total) * 100) : 0}%)
              </span>
            </>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground/50">
          {selectedProjects.length === 0
            ? `${data.projects.length} projects`
            : `${selectedProjects.length} of ${data.projects.length} projects`}
        </span>
      </div>
    </div>
  );
}
