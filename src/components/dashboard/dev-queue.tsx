"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Code2, X, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  priority: number | null;
  projectId: string;
  updatedAt: Date | string | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  project: { id: string; name: string };
}

interface StageGroup {
  stage: string;
  label: string;
  tasks: Task[];
}

interface Props {
  data: { total: number; stages: StageGroup[] };
}

const STAGE_COLORS: Record<string, string> = {
  READY_FOR_DEV: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_DEVELOPMENT: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

const STAGE_DOT: Record<string, string> = {
  READY_FOR_DEV: "bg-blue-400",
  IN_DEVELOPMENT: "bg-indigo-400",
};

const TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400" },
  BUG: { icon: Bug, color: "text-red-400" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400" },
  DESIGN: { icon: Palette, color: "text-purple-400" },
};

function formatTimeInStage(date: Date | string | null) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getPriorityStyle(priority: number | null) {
  if (priority == null) return null;
  if (priority >= 9) return "text-red-400";
  if (priority >= 7) return "text-orange-400";
  if (priority >= 4) return "text-primary";
  return "text-muted-foreground";
}

const PREVIEW = 5;

export function DevQueue({ data }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (data.total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Code2 className="w-4 h-4 text-blue-400" />
          <h2 className="text-[13px] font-semibold text-foreground">Developer</h2>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-[12px] text-muted-foreground">No tasks in dev pipeline.</p>
        </div>
      </div>
    );
  }

  const previewTasks = data.stages.flatMap((s) => s.tasks).slice(0, PREVIEW);
  const hasMore = data.total > PREVIEW;

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-[13px] font-semibold text-foreground">Developer</h2>
            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
              {data.total}
            </span>
            {data.stages.map((s) => (
              <span key={s.stage} className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", STAGE_COLORS[s.stage])}>
                {s.label} {s.tasks.length}
              </span>
            ))}
          </div>
          {hasMore && (
            <button onClick={() => setExpanded(true)} className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors">
              View all
            </button>
          )}
        </div>
        <div className="divide-y divide-border">
          {previewTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </div>

      {expanded && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setExpanded(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-400" />
                <h2 className="text-[14px] font-semibold text-foreground">Developer</h2>
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">{data.total}</span>
              </div>
              <button onClick={() => setExpanded(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {data.stages.map((group) => (
                <div key={group.stage}>
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-muted/30 border-b border-border sticky top-0">
                    <div className={cn("w-2 h-2 rounded-full", STAGE_DOT[group.stage] ?? "bg-muted-foreground")} />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-medium">{group.tasks.length}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {group.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} showProject />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function TaskRow({ task, showProject = false }: { task: Task; showProject?: boolean }) {
  const typeConf = TYPE_ICONS[task.taskType] ?? TYPE_ICONS.FEATURE;
  const TypeIcon = typeConf.icon;
  const priorityColor = getPriorityStyle(task.priority);
  const timeInStage = formatTimeInStage(task.updatedAt);
  const stageColor = STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border";
  const prefix = task.taskType === "BUG" ? "B" : task.taskType === "REPORTED_BUG" ? "RB" : task.taskType === "ENHANCEMENT" ? "E" : task.taskType === "DESIGN" ? "D" : "F";

  return (
    <Link href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group">
      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", typeConf.color.replace("text-", "bg-").replace("400", "500/10"))}>
        <TypeIcon className={cn("w-3 h-3", typeConf.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground/60">{prefix}-{String(task.taskNumber).padStart(3, "0")}</span>
          <span className="text-[12px] font-medium text-foreground truncate">{task.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {showProject && <span className="text-[10px] text-muted-foreground/50">{task.project.name}</span>}
          {task.assignee && (
            <span className="text-[10px] text-muted-foreground/50">
              {showProject && "· "}{task.assignee.name}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {timeInStage && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 font-mono">
            <Clock className="w-2.5 h-2.5" />{timeInStage}
          </span>
        )}
        {task.priority != null && (
          <span className={cn("text-[10px] font-semibold tabular-nums", priorityColor)}>P{task.priority}</span>
        )}
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", stageColor)}>
          {task.stage === "READY_FOR_DEV" ? "Ready" : "In Dev"}
        </span>
        <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
