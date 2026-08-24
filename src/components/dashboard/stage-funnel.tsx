"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BarChart3, ChevronDown, Filter, X, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, Clock, List, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFunnelTasks } from "@/actions/dashboard";

interface FunnelTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  bucket: string;
  priority: number | null;
  projectId: string;
  updatedAt: string;
  project: { id: string; name: string };
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
}

interface Props {
  data: {
    stages: string[];
    totals: Record<string, number>;
    byProject: Record<string, Record<string, number>>;
    projects: { id: string; name: string }[];
    totalTasks: number;
  };
}

const STAGE_META: Record<string, { label: string; color: string; dot: string }> = {
  BACKLOG:           { label: "Backlog",           color: "bg-muted-foreground",    dot: "bg-muted-foreground" },
  SPEC_READY:        { label: "Spec Ready",        color: "bg-violet-400",  dot: "bg-violet-400" },
  NEEDS_INPUT:       { label: "Needs Input",       color: "bg-destructive",    dot: "bg-destructive" },
  CLARIFICATION:     { label: "Clarification",     color: "bg-violet-500",  dot: "bg-violet-500" },
  IN_DEVELOPMENT:    { label: "In Development",    color: "bg-sky-500",     dot: "bg-sky-500" },
  INTERNAL_REVIEW:   { label: "Internal Review",   color: "bg-orange",   dot: "bg-orange" },
  CLIENT_REVIEW:     { label: "Client Review",     color: "bg-orange-500",  dot: "bg-orange-500" },
  DONE:              { label: "Done",              color: "bg-success", dot: "bg-success" },
};

const STAGE_PILL: Record<string, string> = {
  BACKLOG: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  SPEC_READY: "bg-violet-400/10 text-violet-400 border-violet-400/20",
  NEEDS_INPUT: "bg-destructive/10 text-destructive border-destructive/20",
  CLARIFICATION: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  IN_DEVELOPMENT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  INTERNAL_REVIEW: "bg-orange/10 text-orange border-orange/20",
  CLIENT_REVIEW: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  DONE: "bg-success/10 text-success border-success/20",
};

const TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400" },
  BUG: { icon: Bug, color: "text-destructive" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400" },
  DESIGN: { icon: Palette, color: "text-purple-400" },
};

function formatTimeInStage(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function getPriorityStyle(priority: number | null) {
  if (priority == null) return null;
  if (priority >= 9) return "text-destructive";
  if (priority >= 7) return "text-orange-400";
  if (priority >= 4) return "text-primary";
  return "text-muted-foreground";
}

export function StageFunnel({ data }: Props) {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [tasks, setTasks] = useState<FunnelTask[] | null>(null);
  const [loading, startTransition] = useTransition();

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

  function handleViewDetails() {
    if (tasks) {
      setShowDetails(true);
      return;
    }
    startTransition(async () => {
      const result = await getFunnelTasks();
      setTasks(result);
      setShowDetails(true);
    });
  }

  const filteredTasks = (tasks ?? []).filter((t) => {
    if (selectedProjects.length > 0 && !selectedProjects.includes(t.projectId)) return false;
    return true;
  });

  const tasksByStage: Record<string, FunnelTask[]> = {};
  for (const t of filteredTasks) {
    if (!tasksByStage[t.bucket]) tasksByStage[t.bucket] = [];
    tasksByStage[t.bucket].push(t);
  }

  return (
    <>
      <div className="app-card rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-s font-semibold text-foreground">Project Funnel</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
              {total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <button
                onClick={handleViewDetails}
                disabled={loading}
                className="flex items-center gap-xs text-xs font-medium px-2.5 py-1 rounded-md border border-border text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <List className="w-3 h-3" />}
                View Details
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-xs text-xs font-medium px-2.5 py-1 rounded-md border transition-colors",
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
                    <span className="text-xs font-semibold text-foreground">Filter by project</span>
                    {selectedProjects.length > 0 && (
                      <button
                        onClick={() => setSelectedProjects([])}
                        className="text-xs text-primary hover:text-primary/80 font-medium"
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
                            "flex items-center gap-2 w-full px-3 py-1.5 text-s text-start transition-colors",
                            active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/30"
                          )}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                            active ? "bg-primary border-primary" : "border-border"
                          )}>
                            {active && <span className="text-xs text-primary-foreground font-bold">✓</span>}
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
        </div>

        {selectedProjects.length > 0 && (
          <div className="flex items-center gap-xs px-4 py-2 border-b border-border/50 bg-muted/30 flex-wrap">
            {selectedProjects.map((pid) => {
              const proj = data.projects.find((p) => p.id === pid);
              return (
                <span key={pid} className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5 border border-primary/20">
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
            const meta = STAGE_META[stage] ?? { label: stage, color: "bg-muted", dot: "bg-muted" };
            const pct = max > 0 ? (count / max) * 100 : 0;

            return (
              <div key={stage} className={cn(count === 0 && "opacity-50")}>
                <div className="flex items-center gap-3">
                  <div className="w-[120px] shrink-0 flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", meta.color)} />
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex-1 h-7 rounded-md overflow-hidden bg-muted/30 relative">
                    <div
                      className={cn("h-full rounded-md transition-all duration-500 ease-out opacity-80", meta.color)}
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="w-10 text-end text-s font-semibold tabular-nums text-foreground shrink-0">
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {total > 0 && (
              <>
                <span className="font-semibold text-success">{counts[counts.length - 1]}</span>
                <span className="text-muted-foreground/60"> / {total} done</span>
                <span className="text-muted-foreground/40 ms-1.5">
                  ({total > 0 ? Math.round((counts[counts.length - 1] / total) * 100) : 0}%)
                </span>
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground/50">
            {selectedProjects.length === 0
              ? `${data.projects.length} projects`
              : `${selectedProjects.length} of ${data.projects.length} projects`}
          </span>
        </div>
      </div>

      {showDetails && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDetails(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h2 className="text-s font-semibold text-foreground">All Tasks by Stage</h2>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                  {filteredTasks.length}
                </span>
              </div>
              <button onClick={() => setShowDetails(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {data.stages.map((stage) => {
                const stageTasks = tasksByStage[stage];
                if (!stageTasks || stageTasks.length === 0) return null;
                const meta = STAGE_META[stage];

                const byProj: Record<string, { name: string; tasks: FunnelTask[] }> = {};
                for (const t of stageTasks) {
                  if (!byProj[t.projectId]) byProj[t.projectId] = { name: t.project.name, tasks: [] };
                  byProj[t.projectId].tasks.push(t);
                }
                const sortedProjs = Object.entries(byProj).sort((a, b) => b[1].tasks.length - a[1].tasks.length);

                return (
                  <div key={stage}>
                    <div className="flex items-center gap-2 px-5 py-3 bg-muted/60 border-b border-border sticky top-0 z-20">
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", meta?.dot)} />
                      <span className="text-s font-semibold text-foreground">{meta?.label ?? stage}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                        {stageTasks.length}
                      </span>
                    </div>
                    {sortedProjs.map(([pid, group]) => (
                      <div key={pid}>
                        <div className="flex items-center gap-2 px-5 py-1.5 bg-muted/30 border-b border-border/50 sticky top-[44px] z-10">
                          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{group.name}</span>
                          <span className="text-xs text-muted-foreground">{group.tasks.length}</span>
                        </div>
                        <div className="divide-y divide-border/50">
                          {group.tasks.map((task) => (
                            <TaskRow key={task.id} task={task} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function TaskRow({ task }: { task: FunnelTask }) {
  const typeConf = TYPE_ICONS[task.taskType] ?? TYPE_ICONS.FEATURE;
  const TypeIcon = typeConf.icon;
  const priorityColor = getPriorityStyle(task.priority);
  const timeInStage = formatTimeInStage(task.updatedAt);
  const bucketPill = STAGE_PILL[task.bucket] ?? STAGE_PILL[task.stage] ?? "bg-muted text-muted-foreground border-border";
  const bucketLabel = STAGE_META[task.bucket]?.label ?? STAGE_META[task.stage]?.label ?? task.stage;
  const prefix = task.taskType === "BUG" ? "B" : task.taskType === "REPORTED_BUG" ? "RB" : task.taskType === "ENHANCEMENT" ? "E" : task.taskType === "DESIGN" ? "D" : "F";

  return (
    <Link
      href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}
      target="_blank"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group"
    >
      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", typeConf.color.replace("text-", "bg-").replace("400", "500/10"))}>
        <TypeIcon className={cn("w-3 h-3", typeConf.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-xs">
          <span className="text-xs font-mono text-muted-foreground/60">{prefix}-{String(task.taskNumber).padStart(3, "0")}</span>
          <span className="text-s font-medium text-foreground truncate">{task.title}</span>
        </div>
        {task.assignee && (
          <span className="text-xs text-muted-foreground/50">{task.assignee.name}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {timeInStage && (
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground/60 font-mono">
            <Clock className="w-2.5 h-2.5" />{timeInStage}
          </span>
        )}
        {task.priority != null && (
          <span className={cn("text-xs font-semibold tabular-nums", priorityColor)}>P{task.priority}</span>
        )}
        <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded-full border", bucketPill)}>
          {bucketLabel}
        </span>
        <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
