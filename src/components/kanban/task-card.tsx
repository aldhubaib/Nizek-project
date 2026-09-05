"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Undo2, Gauge, Hourglass, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KanbanTask, EstimateAccuracy } from "@/store/kanban";
import { outlineBadge, taskDetailHref } from "@/lib/task-label";
import { taskTypeStyle } from "@/lib/task-type-style";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const ACCURACY_CONFIG: Record<EstimateAccuracy, { label: string; color: string; bg: string }> = {
  WAY_OVER:  outlineBadge("Way Over", "text-destructive", "border-destructive/30"),
  OVER:      outlineBadge("Over", "text-orange", "border-orange/30"),
  ON_TRACK:  outlineBadge("On Track", "text-success", "border-success/30"),
  UNDER:     outlineBadge("Under", "text-primary", "border-primary/30"),
  WAY_UNDER: outlineBadge("Way Under", "text-violet", "border-violet/30"),
};

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Timer badge — click to open a popup explaining what the number means. */
function TimeBadge({
  icon: Icon,
  value,
  label,
  explanation,
}: {
  icon: typeof Hourglass;
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

function UserAvatar({ name, imageUrl }: { name: string | null; imageUrl: string | null }) {
  const initial = name?.split(" ").map((n) => n[0]).join("") ?? "?";
  return (
    <Avatar size="xs">
      {imageUrl && <AvatarImage src={imageUrl} alt={name ?? "User"} />}
      <AvatarFallback className="font-semibold">{initial}</AvatarFallback>
    </Avatar>
  );
}

interface TaskCardProps {
  task: KanbanTask;
  isOverlay?: boolean;
  disabled?: boolean;
  locked?: boolean;
  projectId?: string;
  /** 1-based order in the column / Up Next queue. */
  queueNumber?: number;
  /** True when the viewer may claim this task at its current stage. */
  canSelfAssign?: boolean;
  // Stable callback (receives the task) so this memo'd card doesn't re-render
  // just because the parent recreated a per-card closure.
  onSelfAssign?: (task: KanbanTask) => void;
  onRemoveFromSprint?: (taskId: string) => void;
  hideSprintName?: boolean;
}

export const TaskCard = memo(function TaskCard({ task, isOverlay, disabled, locked, projectId, queueNumber, canSelfAssign, onSelfAssign, onRemoveFromSprint, hideSprintName }: TaskCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: disabled || locked,
    animateLayoutChanges: () => false,
  });

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
    const tab = searchParams.get("tab");
    const from = tab ?? "roadmap";
    router.push(taskDetailHref(projectId, task.id, from));
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  const typeStyle = taskTypeStyle(task.taskType);
  const TypeIcon = typeStyle.icon;

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
        <p className="flex min-w-0 items-start gap-2 text-s font-medium leading-snug text-foreground">
          <span className="min-w-0 line-clamp-2">{task.title}</span>
          {(task.sprintCount ?? 0) >= 2 && (
            <span
              title={`In ${task.sprintCount} sprints`}
              className="inline-flex shrink-0 items-center rounded-lg border border-border px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
            >
              {task.sprintCount}x
            </span>
          )}
        </p>
        {task.sprintName && !hideSprintName && !onRemoveFromSprint && (
          <StatusBadge config={outlineBadge(task.sprintName, "text-primary", "border-primary/30")} className="self-start" />
        )}
        {onRemoveFromSprint && !isOverlay && (
          <button
            type="button"
            aria-label="Remove from sprint"
            title="Remove from sprint"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromSprint(task.id);
            }}
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        )}

        <div className="flex items-center gap-s">
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
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-background",
              typeStyle.border,
              typeStyle.text
            )}
            title={typeStyle.label}
          >
            <TypeIcon className="size-3" strokeWidth={1.5} />
          </span>
          {estimateTime && (
            <span className="text-xs font-mono tabular-nums text-muted-foreground/60">
              <TimeBadge
                icon={Hourglass}
                value={estimateTime}
                label="Estimated time"
                explanation="How long this task was expected to take."
              />
            </span>
          )}
          {queueNumber != null ? (
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-semibold tabular-nums text-primary"
              title={`Order ${queueNumber}`}
            >
              {queueNumber}
            </span>
          ) : null}

          {(task.declineCount ?? 0) > 0 && (
            <StatusBadge
              config={outlineBadge(String(task.declineCount), "text-orange", "border-orange/30")}
              icon={Undo2}
              className="tabular-nums"
              title={`Sent back ${task.declineCount} time${task.declineCount === 1 ? "" : "s"}`}
            />
          )}
          {task.estimateAccuracy && ACCURACY_CONFIG[task.estimateAccuracy] && (
            <StatusBadge
              config={ACCURACY_CONFIG[task.estimateAccuracy]}
              icon={Gauge}
              title={`Estimate: ${ACCURACY_CONFIG[task.estimateAccuracy].label}`}
            />
          )}
        </div>
    </div>
  );
});
