"use client";

import Link from "next/link";
import { Clock, AlertTriangle, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientInputTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  stageLabel: string;
  priority: number | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  project: { id: string; name: string };
  note: string;
  waitingMs: number;
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_COLORS: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  CLARIFICATION: "bg-violet-500/10 text-violet-400 border-violet-500/20",
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
  if (days >= 7) return "text-destructive";
  if (days >= 5) return "text-orange";
  return "text-yellow-400";
}

const PREVIEW_COUNT = 5;

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

function CompactRow({ task }: { task: ClientInputTask }) {
  const color = getDurationColor(task.waitingMs);
  const typeInfo = TASK_TYPE_ICONS[task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${task.project.id}/tasks/${task.id}`}
      target="_blank"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group"
    >
      <Tooltip text={typeInfo?.label ?? task.taskType}>
        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
          <TypeIcon className="w-3 h-3" />
        </div>
      </Tooltip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-s font-medium truncate group-hover:text-primary transition-colors">
            {task.title}
          </p>
          <span className={cn("text-xs font-bold tabular-nums shrink-0", color)}>
            {formatDuration(task.waitingMs)}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {task.assignee?.name ?? "Unassigned"}
            <span className="mx-1">·</span>
            {task.project.name}
          </span>
          {task.note && (
            <Tooltip text={task.note}>
              <StickyNote className="w-2.5 h-2.5 text-orange/60 shrink-0 ms-1" />
            </Tooltip>
          )}
        </div>
      </div>
    </Link>
  );
}

export function NeedsClientInput({ data, tab }: { data: ClientInputTask[]; tab?: string }) {
  const overWeek = data.filter((d) => d.waitingMs > 7 * 24 * 60 * 60 * 1000).length;
  const preview = data.slice(0, PREVIEW_COUNT);
  const prefix = tab === "product" ? "PM" : tab === "dev" ? "Dev" : "";

  return (
    <div className="app-card rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-s font-semibold flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-muted-foreground" />
            {prefix} Needs Client Input
          </h2>
          {data.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-orange bg-orange/10 border border-orange/20 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              {data.length} waiting
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {data.length > 0 ? (
            <span className="text-muted-foreground">
              {data.length} {data.length === 1 ? "task" : "tasks"} &gt; 2d
            </span>
          ) : (
            <span className="text-muted-foreground">All clear</span>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <UserCircle2 className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">No tasks waiting on client</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {preview.map((task) => (
            <CompactRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {data.length > PREVIEW_COUNT && (
        <Link
          href={`/dashboard/needs-client-input${tab ? `?tab=${tab}` : ""}`}
          className="w-full px-4 py-2.5 border-t border-border text-s font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-xs"
        >
          <ExternalLink className="w-3 h-3" />
          View All ({data.length})
        </Link>
      )}
    </div>
  );
}
