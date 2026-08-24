"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { TaskCard } from "./task-card";
import { AddButton } from "@/components/add-button";
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

  const STAGE_IDS = ["BACKLOG", "CLARIFICATION", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "DONE"] as const;
  const isValidDropTarget = useMemo(() => {
    if (!dragFromStage) return false;
    const fromIdx = STAGE_IDS.indexOf(dragFromStage);
    const toIdx = STAGE_IDS.indexOf(stage.id);
    if (toIdx === fromIdx + 1) return true;
    if (dragTaskType === "BUG" && dragFromStage === "INTERNAL_REVIEW" && stage.id === "DONE") return true;
    if (dragFromStage === "INTERNAL_REVIEW" && stage.id === "IN_DEVELOPMENT") return true;
    if (dragFromStage === "CLIENT_REVIEW" && stage.id === "INTERNAL_REVIEW") return true;
    return false;
  }, [dragFromStage, stage.id, dragTaskType]);

  const isDragging = dragFromStage != null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Stacked full-width below lg, capped so one crowded stage scrolls
        // within itself instead of burying the stages below it; a fixed-width
        // full-height rail column from the desktop breakpoint up.
        "flex w-full max-h-[70dvh] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/30 transition-colors lg:h-full lg:max-h-none lg:w-[312px] lg:min-w-[312px]",
        isOver && !disabled && isValidDropTarget && "border-success/60 bg-success/5",
        isOver && !disabled && isDragging && !isValidDropTarget && "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
          <h3 className="text-s font-medium">{stage.label}</h3>
          <span className="text-s text-muted-foreground">{tasks.length}</span>
        </div>
        {/* New tasks always enter the board at Backlog, so only that
            column offers the add button. */}
        {!disabled && canCreateTask && stage.id === "BACKLOG" && (
          <AddButton
            label="New task"
            onClick={() => router.push(`/dashboard/projects/${projectId}/tasks/new`)}
          />
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
                  <div className="flex items-center gap-xs px-1 py-1.5 mb-1.5">
                    <Zap className="w-3 h-3 text-cyan-400" strokeWidth={2} />
                    <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                      Up Next
                    </span>
                    <span className="text-xs text-cyan-400/60">{upNextTasks.length}</span>
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
                  <div className="flex items-center gap-xs px-1 py-1.5 mb-1.5">
                    <CheckCircle2 className="w-3 h-3 text-success" strokeWidth={2} />
                    <span className="text-xs font-semibold text-success uppercase tracking-wider">
                      Ready
                    </span>
                    <span className="text-xs text-success/60">{readyTasks.length}</span>
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
                  <div className="flex items-center gap-xs px-1 py-1.5 mb-1.5">
                    <AlertCircle className="w-3 h-3 text-orange" strokeWidth={2} />
                    <span className="text-xs font-semibold text-orange uppercase tracking-wider">
                      Needs Input
                    </span>
                    <span className="text-xs text-orange/60">{needsInputTasks.length}</span>
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
            <p className="text-s text-muted-foreground/60">No tasks</p>
          </div>
        )}
      </div>

    </div>
  );
});
