"use client";

import Link from "next/link";
import { Clock, Timer, AlertTriangle, Sparkles, Zap, Bug, AlertCircle, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  stageLabel: string;
  priority: number | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  project: { id: string; name: string };
  stageMs: number;
}

const STAGE_COLORS: Record<string, string> = {
  READY_FOR_DEV: "bg-primary/10 text-primary border-primary/20",
  IN_DEVELOPMENT: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  INTERNAL_REVIEW: "bg-orange/10 text-orange border-orange/20",
  CLIENT_REVIEW: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  READY_FOR_RELEASE: "bg-success/10 text-success border-success/20",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  FEATURE: "text-primary",
  ENHANCEMENT: "text-cyan-400",
  BUG: "text-destructive",
  REPORTED_BUG: "text-orange-400",
  DESIGN: "text-purple-400",
};

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-xs text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

function getDurationColor(ms: number) {
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 7) return "text-destructive";
  if (days >= 5) return "text-orange";
  return "text-yellow-400";
}

function FullRow({ task }: { task: PipelineTask }) {
  const stageColor = getDurationColor(task.stageMs);
  const typeInfo = TASK_TYPE_ICONS[task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${task.project.id}/tasks/${task.id}`}
      target="_blank"
      className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_140px_110px_120px_80px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Tooltip text={typeInfo?.label ?? task.taskType}>
          <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        <div className="min-w-0">
          <p className="text-s font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
          <p className="text-xs text-muted-foreground/50">
            <span className={cn("font-mono", TASK_TYPE_COLORS[task.taskType] ?? "text-muted-foreground")}>#{task.taskNumber}</span>
            <span className="mx-1">·</span>
            {typeInfo?.label ?? task.taskType.replace("_", " ")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0 @max-md/card:hidden">
        {task.assignee ? (
          <>
            {task.assignee.imageUrl ? (
              <img src={task.assignee.imageUrl} alt={task.assignee.name ?? ""} className="w-5 h-5 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">{(task.assignee.name ?? "?").charAt(0).toUpperCase()}</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground truncate">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/50">Unassigned</span>
        )}
      </div>

      <span className="text-xs text-muted-foreground truncate @max-md/card:hidden">{task.project.name}</span>

      <div className="flex justify-center @max-md/card:hidden">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border truncate", STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border")}>
          {task.stageLabel}
        </span>
      </div>

      <div className="flex justify-center">
        <span className={cn("text-s font-mono font-bold tabular-nums flex items-center gap-1", stageColor)}>
          <Clock className="w-3 h-3" />
          {formatDuration(task.stageMs)}
        </span>
      </div>
    </Link>
  );
}

export function PipelineFullTable({ data }: { data: PipelineTask[] }) {
  const overWeek = data.filter((d) => d.stageMs > 7 * 24 * 60 * 60 * 1000).length;

  return (
    <div>
      {overWeek > 0 && (
        <div className="mb-4 flex justify-end">
          <span className="flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {overWeek} over a week
          </span>
        </div>
      )}

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Timer className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">No tasks stuck in the pipeline</p>
        </div>
      ) : (
        <div className="app-card rounded-xl border border-border bg-card divide-y divide-border">
          <div className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_140px_110px_120px_80px] gap-4 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
            <span>Task</span>
            <span className="@max-md/card:hidden">Assignee</span>
            <span className="@max-md/card:hidden">Project</span>
            <span className="text-center @max-md/card:hidden">Stage</span>
            <span className="text-center">In Stage</span>
          </div>
          {data.map((task) => (
            <FullRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
