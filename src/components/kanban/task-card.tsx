"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Expand, Sparkles, Wrench, Bug, Clock, Timer, Undo2, AlertCircle, Palette, Gauge } from "lucide-react";
import { useState, useEffect, memo } from "react";
import type { KanbanTask, TaskType, EstimateAccuracy } from "@/store/kanban";
import { cn } from "@/lib/utils";

function getPriorityStyle(priority: number) {
  if (priority >= 9) return { color: "text-destructive", bg: "bg-destructive/15 border-destructive/20" };
  if (priority >= 7) return { color: "text-orange", bg: "bg-orange/15 border-orange/20" };
  if (priority >= 4) return { color: "text-primary", bg: "bg-primary/15 border-primary/20" };
  return { color: "text-muted-foreground", bg: "bg-muted border-border" };
}

const ACCURACY_CONFIG: Record<EstimateAccuracy, { label: string; color: string; bg: string }> = {
  WAY_OVER:  { label: "Way Over",  color: "text-destructive",  bg: "bg-destructive/15 border-destructive/20" },
  OVER:      { label: "Over",      color: "text-orange-400",   bg: "bg-orange-500/15 border-orange-500/20" },
  ON_TRACK:  { label: "On Track",  color: "text-emerald-400",  bg: "bg-emerald-500/15 border-emerald-500/20" },
  UNDER:     { label: "Under",     color: "text-blue-400",     bg: "bg-blue-500/15 border-blue-500/20" },
  WAY_UNDER: { label: "Way Under", color: "text-violet-400",   bg: "bg-violet-500/15 border-violet-500/20" },
};

const TYPE_CONFIG: Record<TaskType, { icon: typeof Sparkles; color: string; bg: string; tooltip: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary", bg: "bg-primary/10 border-primary/20", tooltip: "Feature" },
  ENHANCEMENT: { icon: Wrench, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", tooltip: "Enhancement" },
  BUG: { icon: Bug, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", tooltip: "Internal Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", tooltip: "Reported Bug (Client)" },
  DESIGN: { icon: Palette, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", tooltip: "Design" },
};

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function useLiveDuration(isoDate: string | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!isoDate) return;
    const interval = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(interval);
  }, [isoDate]);
  if (!isoDate) return null;
  return formatDuration(Date.now() - new Date(isoDate).getTime());
}

function UserAvatar({ name, imageUrl, size = 5 }: { name: string | null; imageUrl: string | null; size?: number }) {
  const initials = name?.split(" ").map((n) => n[0]).join("") ?? "?";
  const sizeClass = size === 5 ? "w-5 h-5 text-[9px]" : "w-4 h-4 text-[8px]";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? "User"}
        className={cn("rounded-full object-cover", size === 5 ? "w-5 h-5" : "w-4 h-4")}
      />
    );
  }

  return (
    <div className={cn("rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground", sizeClass)}>
      {initials}
    </div>
  );
}

interface TaskCardProps {
  task: KanbanTask;
  isOverlay?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onExpand?: () => void;
}

export const TaskCard = memo(function TaskCard({ task, isOverlay, disabled, locked, onExpand }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disabled || locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyle = task.priority != null ? getPriorityStyle(task.priority) : null;
  const typeConfig = TYPE_CONFIG[task.taskType] ?? TYPE_CONFIG.FEATURE;
  const TypeIcon = typeConfig.icon;

  const totalTime = useLiveDuration(task.startedAt);
  const stageTime = useLiveDuration(task.stageEnteredAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/20",
        isDragging && "opacity-50",
        isOverlay && "rotate-2 shadow-xl border-primary/50",
        disabled ? "opacity-70" : locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      )}
    >
      {onExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground/40 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all z-10"
          title="Open details"
        >
          <Expand className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      )}

      <div className="min-w-0">
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {task.taskType === "BUG" ? "B" : task.taskType === "REPORTED_BUG" ? "RB" : task.taskType === "ENHANCEMENT" ? "E" : task.taskType === "DESIGN" ? "D" : "F"}-{String(task.taskNumber).padStart(3, "0")}
        </span>
        <p className="text-[13px] font-medium leading-snug text-foreground">
          {task.title}
        </p>

        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full border w-5 h-5",
              typeConfig.bg,
              typeConfig.color
            )}
            title={typeConfig.tooltip}
          >
            <TypeIcon className="w-3 h-3" strokeWidth={1.5} />
          </span>
          {priorityStyle ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                priorityStyle.bg,
                priorityStyle.color
              )}
            >
              P{task.priority}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground/50">
              No priority
            </span>
          )}

          {(task.internalDeclines ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 tabular-nums"
              title={`Internal review declined ${task.internalDeclines} time${task.internalDeclines === 1 ? "" : "s"}`}
            >
              <Undo2 className="w-2.5 h-2.5" />
              {task.internalDeclines}
            </span>
          )}
          {(task.clientDeclines ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive tabular-nums"
              title={`Client review declined ${task.clientDeclines} time${task.clientDeclines === 1 ? "" : "s"}`}
            >
              <Undo2 className="w-2.5 h-2.5" />
              {task.clientDeclines}
            </span>
          )}
          {task.estimateAccuracy && ACCURACY_CONFIG[task.estimateAccuracy] && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                ACCURACY_CONFIG[task.estimateAccuracy].bg,
                ACCURACY_CONFIG[task.estimateAccuracy].color
              )}
              title={`Estimate: ${ACCURACY_CONFIG[task.estimateAccuracy].label}`}
            >
              <Gauge className="w-2.5 h-2.5" />
              {ACCURACY_CONFIG[task.estimateAccuracy].label}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            {task.assignee && (
              <UserAvatar name={task.assignee.name} imageUrl={task.assignee.imageUrl} />
            )}
          </div>
        </div>

        {(totalTime || stageTime) && (
          <div className="mt-2 flex items-center gap-3 text-[10px] font-mono tabular-nums text-muted-foreground/60">
            {totalTime && (
              <span className="flex items-center gap-1" title="Total time since Ready for Dev">
                <Clock className="w-3 h-3" />
                {totalTime}
              </span>
            )}
            {stageTime && (
              <span className="flex items-center gap-1" title="Time in current stage">
                <Timer className="w-3 h-3" />
                {stageTime}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
