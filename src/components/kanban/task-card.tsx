"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sparkles, Wrench, Bug, Clock, Timer, Undo2, AlertCircle, Palette, Gauge, Hourglass, CircleSlash } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { KanbanTask, TaskType, EstimateAccuracy } from "@/store/kanban";
import { cn } from "@/lib/utils";
import { useMinuteTick } from "@/lib/use-minute-clock";

function getPriorityStyle(priority: number) {
  if (priority >= 9) return { color: "text-destructive", bg: "bg-destructive/15 border-destructive/20" };
  if (priority >= 7) return { color: "text-orange", bg: "bg-orange/15 border-orange/20" };
  if (priority >= 4) return { color: "text-primary", bg: "bg-primary/15 border-primary/20" };
  return { color: "text-muted-foreground", bg: "bg-muted border-border" };
}

const ACCURACY_CONFIG: Record<EstimateAccuracy, { label: string; color: string; bg: string }> = {
  WAY_OVER:  { label: "Way Over",  color: "text-destructive",  bg: "bg-destructive/15 border-destructive/20" },
  OVER:      { label: "Over",      color: "text-orange-400",   bg: "bg-orange-500/15 border-orange-500/20" },
  ON_TRACK:  { label: "On Track",  color: "text-success",  bg: "bg-success/15 border-success/20" },
  UNDER:     { label: "Under",     color: "text-primary",     bg: "bg-primary/15 border-primary/20" },
  WAY_UNDER: { label: "Way Under", color: "text-violet-400",   bg: "bg-violet-500/15 border-violet-500/20" },
};

const TYPE_CONFIG: Record<TaskType, { icon: typeof Sparkles; color: string; bg: string; tooltip: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary", bg: "bg-primary/10 border-primary/20", tooltip: "Business Case" },
  ENHANCEMENT: { icon: Wrench, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", tooltip: "Enhancement" },
  BUG: { icon: Bug, color: "text-orange", bg: "bg-orange/10 border-orange/20", tooltip: "Internal Bug" },
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

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function liveDuration(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  return formatDuration(Date.now() - new Date(isoDate).getTime());
}

/** Timer badge — click to open a popup explaining what the number means. */
function TimeBadge({
  icon: Icon,
  value,
  label,
  explanation,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
  explanation: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1 cursor-pointer transition-colors hover:text-primary"
      >
        <Icon className="w-3 h-3" />
        {value}
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <span
            className={cn(
              "absolute bottom-full left-0 mb-1.5 z-50 w-52",
              "rounded-lg border border-border bg-sidebar p-2.5 shadow-xl",
              "font-sans normal-nums whitespace-normal",
            )}
          >
            <span className="block text-xs font-semibold text-foreground mb-0.5">{label}</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">{explanation}</span>
          </span>
        </>
      )}
    </span>
  );
}

function UserAvatar({ name, imageUrl, size = 5 }: { name: string | null; imageUrl: string | null; size?: number }) {
  const initials = name?.split(" ").map((n) => n[0]).join("") ?? "?";
  const sizeClass = size === 5 ? "w-5 h-5 text-xs" : "w-4 h-4 text-xs";

  if (imageUrl) {
    const px = size === 5 ? 20 : 16;
    return (
      <Image
        src={imageUrl}
        alt={name ?? "User"}
        width={px}
        height={px}
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
  projectId?: string;
  /** True when the viewer may claim this task at its current stage. */
  canSelfAssign?: boolean;
  // Stable callback (receives the task) so this memo'd card doesn't re-render
  // just because the parent recreated a per-card closure.
  onSelfAssign?: (task: KanbanTask) => void;
}

export const TaskCard = memo(function TaskCard({ task, isOverlay, disabled, locked, projectId, canSelfAssign, onSelfAssign }: TaskCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disabled || locked });

  // Clicking the card opens the task's details page — but the browser also
  // fires a click when a drag ends on the card, so remember that a drag
  // happened and swallow that one.
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  const openDetails = () => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    if (!projectId || isOverlay) return;
    router.push(`/dashboard/projects/${projectId}/tasks/${task.id}`);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyle = task.priority != null ? getPriorityStyle(task.priority) : null;
  const typeConfig = TYPE_CONFIG[task.taskType] ?? TYPE_CONFIG.FEATURE;
  const TypeIcon = typeConfig.icon;

  // One shared minute clock drives all cards' live durations (re-render once/min
  // only while this card actually shows a duration).
  useMinuteTick(Boolean(task.startedAt || task.stageEnteredAt));
  // The delivery clock (In Development → completed) freezes once the task hits
  // Done — the Done stage log's enteredAt is the completion moment.
  const totalTime =
    task.stage === "DONE"
      ? task.startedAt && task.stageEnteredAt
        ? formatDuration(new Date(task.stageEnteredAt).getTime() - new Date(task.startedAt).getTime())
        : null
      : liveDuration(task.startedAt);
  const stageTime = liveDuration(task.stageEnteredAt);
  const estimateTime =
    task.estimatedMinutes != null && task.estimatedMinutes > 0
      ? formatEstimate(task.estimatedMinutes)
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={openDetails}
      className={cn(
        "group relative flex flex-col gap-card rounded-lg border border-border bg-card p-card transition-colors hover:border-muted-foreground/20",
        isDragging && "opacity-50",
        isOverlay && "rotate-2 shadow-xl border-primary/50",
        disabled && "opacity-70",
        // Cards that can't be dragged still open their details on click.
        disabled || locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      )}
    >
      <span className="min-w-0 text-xs font-mono text-muted-foreground/60">
          {task.taskType === "BUG" ? "B" : task.taskType === "REPORTED_BUG" ? "RB" : task.taskType === "ENHANCEMENT" ? "E" : task.taskType === "DESIGN" ? "D" : "F"}-{String(task.taskNumber).padStart(3, "0")}
        </span>
        <p className="text-s font-medium leading-snug text-foreground">
          {task.title}
        </p>

        <div className="flex items-center gap-s">
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
              typeConfig.bg,
              typeConfig.color
            )}
            title={typeConfig.tooltip}
          >
            <TypeIcon className="size-3" strokeWidth={1.5} />
          </span>
          {priorityStyle ? (
            <span
              className={cn(
                "app-badge inline-flex size-5 shrink-0 items-center justify-center rounded-full border px-px",
                priorityStyle.bg,
                priorityStyle.color
              )}
              title={`Priority ${task.priority}`}
            >
              <span className="text-fit font-semibold leading-none tabular-nums">
                P{task.priority}
              </span>
            </span>
          ) : (
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground/50"
              title="No priority"
            >
              <CircleSlash className="size-3" strokeWidth={1.75} />
            </span>
          )}

          {(task.internalDeclines ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-xs rounded-full border border-orange/20 bg-orange/10 px-1.5 py-0.5 text-xs font-semibold text-orange tabular-nums"
              title={`Internal review declined ${task.internalDeclines} time${task.internalDeclines === 1 ? "" : "s"}`}
            >
              <Undo2 className="w-2.5 h-2.5" />
              {task.internalDeclines}
            </span>
          )}
          {(task.clientDeclines ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-xs rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive tabular-nums"
              title={`Client review declined ${task.clientDeclines} time${task.clientDeclines === 1 ? "" : "s"}`}
            >
              <Undo2 className="w-2.5 h-2.5" />
              {task.clientDeclines}
            </span>
          )}
          {task.estimateAccuracy && ACCURACY_CONFIG[task.estimateAccuracy] && (
            <span
              className={cn(
                "inline-flex items-center gap-xs rounded-full border px-1.5 py-0.5 text-xs font-semibold",
                ACCURACY_CONFIG[task.estimateAccuracy].bg,
                ACCURACY_CONFIG[task.estimateAccuracy].color
              )}
              title={`Estimate: ${ACCURACY_CONFIG[task.estimateAccuracy].label}`}
            >
              <Gauge className="w-2.5 h-2.5" />
              {ACCURACY_CONFIG[task.estimateAccuracy].label}
            </span>
          )}

          <div className="ms-auto flex items-center gap-xs">
            {canSelfAssign && onSelfAssign ? (
              <button
                type="button"
                aria-label="Assign this task to me"
                title={task.assignee ? `${task.assignee.name ?? "Assigned"} — click to assign to me` : "Assign to me"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelfAssign(task);
                }}
                className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/60"
              >
                <UserAvatar name={task.assignee?.name ?? null} imageUrl={task.assignee?.imageUrl ?? null} />
              </button>
            ) : (
              task.assignee && (
                <UserAvatar name={task.assignee.name} imageUrl={task.assignee.imageUrl} />
              )
            )}
          </div>
        </div>

        {(estimateTime || totalTime || stageTime) && (
          <div className="flex items-center gap-s text-xs font-mono tabular-nums text-muted-foreground/60">
            {estimateTime && (
              <TimeBadge
                icon={Hourglass}
                value={estimateTime}
                label="Estimated time"
                explanation="How long this task was expected to take when it entered In Development."
              />
            )}
            {totalTime && (
              <TimeBadge
                icon={Clock}
                value={totalTime}
                label={task.stage === "DONE" ? "Delivery time" : "Delivery clock"}
                explanation={
                  task.stage === "DONE"
                    ? "Total time from In Development until the task was completed. Frozen — it no longer counts."
                    : "Counts from the moment the task entered In Development until it reaches Done. Keeps running through development, reviews and rework — declines don't reset it."
                }
              />
            )}
            {stageTime && (
              <TimeBadge
                icon={Timer}
                value={stageTime}
                label="Time in current stage"
                explanation="How long the task has been sitting in this column. Resets every time the task moves to another stage — useful for spotting stuck tasks."
              />
            )}
          </div>
        )}
    </div>
  );
});
