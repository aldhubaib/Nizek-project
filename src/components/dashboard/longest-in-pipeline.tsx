"use client";

import Link from "next/link";
import { Clock, Timer, AlertTriangle } from "lucide-react";
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
  pipelineMs: number;
  stageMs: number;
}

const TASK_TYPE_COLORS: Record<string, string> = {
  FEATURE: "text-blue-400",
  ENHANCEMENT: "text-cyan-400",
  BUG: "text-red-400",
  REPORTED_BUG: "text-orange-400",
  DESIGN: "text-purple-400",
};

const STAGE_COLORS: Record<string, string> = {
  READY_FOR_DEV: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_DEVELOPMENT: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  INTERNAL_REVIEW: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CLIENT_REVIEW: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  READY_FOR_RELEASE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

function getDurationColor(ms: number) {
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 7) return "text-red-400";
  if (days >= 3) return "text-amber-400";
  if (days >= 1) return "text-yellow-400";
  return "text-muted-foreground";
}

export function LongestInPipeline({ data }: { data: PipelineTask[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[14px] font-semibold mb-4 flex items-center gap-2">
          <Timer className="w-4 h-4 text-muted-foreground" />
          Longest in Pipeline
        </h2>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Timer className="w-8 h-8 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">No active tasks in the pipeline.</p>
        </div>
      </div>
    );
  }

  const overWeek = data.filter((d) => d.pipelineMs > 7 * 24 * 60 * 60 * 1000).length;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <Timer className="w-4 h-4 text-muted-foreground" />
          Longest in Pipeline
          <span className="text-[11px] font-normal text-muted-foreground">
            ({data.length} task{data.length !== 1 ? "s" : ""})
          </span>
        </h2>
        {overWeek > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {overWeek} over a week
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {/* Header */}
        <div className="grid grid-cols-[1fr_120px_130px_90px_90px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
          <span>Task</span>
          <span>Project</span>
          <span className="text-center">Stage</span>
          <span className="text-center">In Stage</span>
          <span className="text-center">Total</span>
        </div>

        {data.map((task) => {
          const pipelineColor = getDurationColor(task.pipelineMs);
          const stageColor = getDurationColor(task.stageMs);

          return (
            <Link
              key={task.id}
              href={`/dashboard/projects/${task.project.id}?task=${task.id}`}
              className="grid grid-cols-[1fr_120px_130px_90px_90px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
            >
              {/* Task */}
              <div className="flex items-center gap-3 min-w-0">
                {task.assignee?.imageUrl ? (
                  <img
                    src={task.assignee.imageUrl}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                ) : task.assignee ? (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                    {(task.assignee.name ?? "?")[0].toUpperCase()}
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted border border-dashed border-border shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                    {task.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50">
                    <span className={cn("font-mono", TASK_TYPE_COLORS[task.taskType] ?? "text-muted-foreground")}>
                      #{task.taskNumber}
                    </span>
                    <span className="mx-1">·</span>
                    {task.taskType.replace("_", " ")}
                  </p>
                </div>
              </div>

              {/* Project */}
              <span className="text-[11px] text-muted-foreground truncate">
                {task.project.name}
              </span>

              {/* Stage */}
              <div className="flex justify-center">
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate",
                    STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {task.stageLabel}
                </span>
              </div>

              {/* Time in Stage */}
              <div className="flex justify-center">
                <span className={cn("text-[12px] font-mono font-bold tabular-nums flex items-center gap-1", stageColor)}>
                  <Clock className="w-3 h-3" />
                  {formatDuration(task.stageMs)}
                </span>
              </div>

              {/* Total Pipeline */}
              <div className="flex justify-center">
                <span className={cn("text-[12px] font-mono font-bold tabular-nums", pipelineColor)}>
                  {formatDuration(task.pipelineMs)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
