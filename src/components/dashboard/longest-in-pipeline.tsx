"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Clock, Timer, AlertTriangle, X, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette } from "lucide-react";
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

const STAGE_COLORS: Record<string, string> = {
  READY_FOR_DEV: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_DEVELOPMENT: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  INTERNAL_REVIEW: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CLIENT_REVIEW: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  READY_FOR_RELEASE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const STAGE_BAR_COLORS: Record<string, string> = {
  READY_FOR_DEV: "bg-blue-500",
  IN_DEVELOPMENT: "bg-violet-500",
  INTERNAL_REVIEW: "bg-amber-500",
  CLIENT_REVIEW: "bg-cyan-500",
  READY_FOR_RELEASE: "bg-emerald-500",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  FEATURE: "text-blue-400",
  ENHANCEMENT: "text-cyan-400",
  BUG: "text-red-400",
  REPORTED_BUG: "text-orange-400",
  DESIGN: "text-purple-400",
};

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-[10px] text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
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
  if (days >= 7) return "text-red-400";
  if (days >= 3) return "text-amber-400";
  if (days >= 1) return "text-yellow-400";
  return "text-muted-foreground";
}

function getBarWidth(ms: number, maxMs: number) {
  if (maxMs <= 0) return 0;
  return Math.min(100, Math.max(4, (ms / maxMs) * 100));
}

const PREVIEW_COUNT = 5;

function CompactRow({ task, maxMs }: { task: PipelineTask; maxMs: number }) {
  const color = getDurationColor(task.pipelineMs);
  const barW = getBarWidth(task.pipelineMs, maxMs);
  const barColor = STAGE_BAR_COLORS[task.stage] ?? "bg-muted-foreground";
  const typeInfo = TASK_TYPE_ICONS[task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link href={`/dashboard/projects/${task.project.id}?task=${task.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group">
      <Tooltip text={typeInfo?.label ?? task.taskType}>
        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
          <TypeIcon className="w-3 h-3" />
        </div>
      </Tooltip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">
            <span className="text-muted-foreground/50 font-mono mr-1">#{task.taskNumber}</span>
            {task.title}
          </p>
          <span className={cn("text-[11px] font-bold tabular-nums shrink-0", color)}>
            {formatDuration(task.pipelineMs)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${barW}%` }} />
          </div>
          <span className={cn("text-[9px] font-semibold px-1.5 py-0 rounded-full border shrink-0", STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border")}>
            {task.stageLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

function FullRow({ task }: { task: PipelineTask }) {
  const pipelineColor = getDurationColor(task.pipelineMs);
  const stageColor = getDurationColor(task.stageMs);
  const typeInfo = TASK_TYPE_ICONS[task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${task.project.id}?task=${task.id}`}
      className="grid grid-cols-[1fr_110px_120px_80px_80px] gap-4 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Tooltip text={typeInfo?.label ?? task.taskType}>
          <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
          <p className="text-[10px] text-muted-foreground/50">
            <span className={cn("font-mono", TASK_TYPE_COLORS[task.taskType] ?? "text-muted-foreground")}>#{task.taskNumber}</span>
            <span className="mx-1">·</span>
            {typeInfo?.label ?? task.taskType.replace("_", " ")}
          </p>
        </div>
      </div>

      <span className="text-[11px] text-muted-foreground truncate">{task.project.name}</span>

      <div className="flex justify-center">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate", STAGE_COLORS[task.stage] ?? "bg-muted text-muted-foreground border-border")}>
          {task.stageLabel}
        </span>
      </div>

      <div className="flex justify-center">
        <span className={cn("text-[12px] font-mono font-bold tabular-nums flex items-center gap-1", stageColor)}>
          <Clock className="w-3 h-3" />
          {formatDuration(task.stageMs)}
        </span>
      </div>

      <div className="flex justify-center">
        <span className={cn("text-[12px] font-mono font-bold tabular-nums", pipelineColor)}>
          {formatDuration(task.pipelineMs)}
        </span>
      </div>
    </Link>
  );
}

export function LongestInPipeline({ data }: { data: PipelineTask[] }) {
  const [showAll, setShowAll] = useState(false);

  const overWeek = data.filter((d) => d.pipelineMs > 7 * 24 * 60 * 60 * 1000).length;
  const over3d = data.filter((d) => {
    const days = d.pipelineMs / (1000 * 60 * 60 * 24);
    return days >= 3 && days < 7;
  }).length;
  const over1d = data.filter((d) => {
    const days = d.pipelineMs / (1000 * 60 * 60 * 24);
    return days >= 1 && days < 3;
  }).length;
  const maxMs = data.length > 0 ? Math.max(...data.map((d) => d.pipelineMs)) : 0;
  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              Longest in Pipeline
            </h2>
            {overWeek > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {overWeek} critical
              </span>
            )}
          </div>
          {/* Summary */}
          <div className="flex items-center gap-3 text-[11px]">
            {over1d > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">{over1d} &gt; 1d</span>
              </div>
            )}
            {over3d > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">{over3d} &gt; 3d</span>
              </div>
            )}
            {overWeek > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">{overWeek} &gt; 7d</span>
              </div>
            )}
            {data.length === 0 && (
              <span className="text-muted-foreground">All clear</span>
            )}
          </div>
        </div>

        {/* Preview rows */}
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Timer className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">No stalled tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((task) => (
              <CompactRow key={task.id} task={task} maxMs={maxMs} />
            ))}
          </div>
        )}

        {/* View All */}
        {data.length > PREVIEW_COUNT && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({data.length})
          </button>
        )}
      </div>

      {/* Full overlay */}
      {showAll && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAll(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-[13px] font-semibold flex items-center gap-2">
                <Timer className="w-4 h-4 text-muted-foreground" />
                Longest in Pipeline
                <span className="text-[11px] font-normal text-muted-foreground">({data.length} tasks)</span>
              </h2>
            </div>
            {overWeek > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {overWeek} over a week
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[1fr_110px_120px_80px_80px] gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span>Project</span>
                  <span className="text-center">Stage</span>
                  <span className="text-center">In Stage</span>
                  <span className="text-center">Total</span>
                </div>
                {data.map((task) => (
                  <FullRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
