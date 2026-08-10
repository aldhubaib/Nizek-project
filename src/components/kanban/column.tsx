"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { TaskCard } from "./task-card";
import { useMemo, memo } from "react";
import type { KanbanTask, Stage } from "@/store/kanban";
import { cn } from "@/lib/utils";

interface ColumnProps {
  stage: { id: Stage; label: string; color: string };
  tasks: KanbanTask[];
  disabled?: boolean;
  projectId: string;
  canCreateTask?: boolean;
  dragFromStage?: Stage | null;
  dragTaskType?: string | null;
  canSelfAssign?: (task: KanbanTask) => boolean;
  onSelfAssign?: (task: KanbanTask) => void;
}

export const KanbanColumn = memo(function KanbanColumn({ stage, tasks, disabled, projectId, canCreateTask, dragFromStage, dragTaskType, canSelfAssign, onSelfAssign }: ColumnProps) {
  const router = useRouter();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const isClarification = stage.id === "CLARIFICATION";

  const MAX_UP_NEXT = 1;

  const { upNextTasks, readyTasks, needsInputTasks } = useMemo(() => {
    if (!isClarification) return { upNextTasks: [], readyTasks: tasks, needsInputTasks: [] };
    const ready = tasks
      .filter((t) => t.isReadyForTransition)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const needs = tasks.filter((t) => !t.isReadyForTransition);
    const upNext = ready.slice(0, MAX_UP_NEXT);
    const remaining = ready.slice(MAX_UP_NEXT);
    return { upNextTasks: upNext, readyTasks: remaining, needsInputTasks: needs };
  }, [tasks, isClarification]);

  const allTaskIds = useMemo(
    () => [...upNextTasks, ...readyTasks, ...needsInputTasks].map((t) => t.id),
    [upNextTasks, readyTasks, needsInputTasks]
  );

  const STAGE_IDS = ["NEW_REQUEST", "CLARIFICATION", "READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE"] as const;
  const isValidDropTarget = useMemo(() => {
    if (!dragFromStage) return false;
    const fromIdx = STAGE_IDS.indexOf(dragFromStage);
    const toIdx = STAGE_IDS.indexOf(stage.id);
    if (toIdx === fromIdx + 1) return true;
    if (dragTaskType === "BUG" && dragFromStage === "INTERNAL_REVIEW" && stage.id === "READY_FOR_RELEASE") return true;
    if (dragFromStage === "INTERNAL_REVIEW" && stage.id === "IN_DEVELOPMENT") return true;
    if (dragFromStage === "CLIENT_REVIEW" && stage.id === "INTERNAL_REVIEW") return true;
    return false;
  }, [dragFromStage, stage.id, dragTaskType]);

  const isDragging = dragFromStage != null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Stacked full-width on phones, capped so one crowded stage scrolls
        // within itself instead of burying the stages below it; a fixed-width
        // full-height rail column from sm up.
        "flex flex-col rounded-lg bg-muted/30 border border-border/50 w-full max-h-[70dvh] sm:min-w-[312px] sm:w-[312px] shrink-0 sm:max-h-none sm:h-full transition-colors",
        isOver && !disabled && isValidDropTarget && "border-emerald-500/60 bg-emerald-500/5",
        isOver && !disabled && isDragging && !isValidDropTarget && "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
          <h3 className="text-sm font-medium">{stage.label}</h3>
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        {/* New tasks always enter the board at New Request, so only that
            column offers the add button. */}
        {!disabled && canCreateTask && stage.id === "NEW_REQUEST" && (
          <button
            onClick={() => router.push(`/dashboard/projects/${projectId}/tasks/new`)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 p-2 overflow-y-auto">
        <SortableContext
          items={allTaskIds}
          strategy={verticalListSortingStrategy}
        >
          {isClarification && tasks.length > 0 ? (
            <>
              {upNextTasks.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 px-1 py-1.5 mb-1.5">
                    <Zap className="w-3 h-3 text-cyan-400" strokeWidth={2} />
                    <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                      Up Next
                    </span>
                    <span className="text-[10px] text-cyan-400/60">{upNextTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {upNextTasks.map((task, i) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={disabled}
                        locked={i > 0}
                        projectId={projectId}
                        canSelfAssign={canSelfAssign?.(task) ?? false}
                        onSelfAssign={onSelfAssign}
                      />
                    ))}
                  </div>
                </div>
              )}

              {readyTasks.length > 0 && (
                <div>
                  {upNextTasks.length > 0 && (
                    <div className="border-t border-border/50 my-2" />
                  )}
                  <div className="flex items-center gap-1.5 px-1 py-1.5 mb-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" strokeWidth={2} />
                    <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                      Ready
                    </span>
                    <span className="text-[10px] text-emerald-500/60">{readyTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {readyTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={disabled}
                        locked
                        projectId={projectId}
                        canSelfAssign={canSelfAssign?.(task) ?? false}
                        onSelfAssign={onSelfAssign}
                      />
                    ))}
                  </div>
                </div>
              )}

              {needsInputTasks.length > 0 && (
                <div>
                  {(upNextTasks.length > 0 || readyTasks.length > 0) && (
                    <div className="border-t border-border/50 my-2" />
                  )}
                  <div className="flex items-center gap-1.5 px-1 py-1.5 mb-1.5">
                    <AlertCircle className="w-3 h-3 text-amber-500" strokeWidth={2} />
                    <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                      Needs Input
                    </span>
                    <span className="text-[10px] text-amber-500/60">{needsInputTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {needsInputTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={disabled}
                        locked
                        projectId={projectId}
                        canSelfAssign={canSelfAssign?.(task) ?? false}
                        onSelfAssign={onSelfAssign}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  disabled={disabled}
                  projectId={projectId}
                  canSelfAssign={canSelfAssign?.(task) ?? false}
                  onSelfAssign={onSelfAssign}
                />
              ))}
            </div>
          )}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground/60">No tasks</p>
          </div>
        )}
      </div>

    </div>
  );
});
