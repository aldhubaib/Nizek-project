"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  onRemoveFromSprint?: (taskId: string) => void;
  hideSprintName?: boolean;
  pipelineOnly?: boolean;
}

export const KanbanColumn = memo(function KanbanColumn({ stage, tasks, disabled, projectId, canCreateTask, dragFromStage, dragTaskType, canSelfAssign, onSelfAssign, onRemoveFromSprint, hideSprintName, pipelineOnly }: ColumnProps) {
  const router = useRouter();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const allTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const isValidDropTarget = useMemo(() => {
    if (!dragFromStage) return false;
    const stageIds = pipelineOnly
      ? ["READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "DONE"]
      : ["NEW_REQUEST", "READY_FOR_DEV", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE"];
    const fromIdx = stageIds.indexOf(dragFromStage);
    const toIdx = stageIds.indexOf(stage.id);
    if (toIdx === fromIdx + 1) return true;
    if (dragTaskType === "BUG" && dragFromStage === "INTERNAL_REVIEW" && stage.id === "DONE") return true;
    if (dragFromStage === "INTERNAL_REVIEW" && stage.id === "IN_DEVELOPMENT") return true;
    if (dragFromStage === "CLIENT_REVIEW" && stage.id === "INTERNAL_REVIEW") return true;
    return false;
  }, [dragFromStage, stage.id, dragTaskType, pipelineOnly]);

  const isDragging = dragFromStage != null;

  return (
    <div
      ref={setNodeRef}
        className={cn(
          "flex w-full max-h-[70dvh] shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-colors lg:h-full lg:max-h-none lg:min-h-0 lg:w-[400px] lg:self-stretch",
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
        {!disabled && canCreateTask && stage.id === "NEW_REQUEST" && (
          <AddButton
            label="New task"
            onClick={() => router.push(`/dashboard/projects/${projectId}/tasks/new`)}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain p-2">
        <SortableContext
          items={allTaskIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                disabled={disabled}
                projectId={projectId}
                canSelfAssign={canSelfAssign?.(task) ?? false}
                onSelfAssign={onSelfAssign}
                onRemoveFromSprint={onRemoveFromSprint}
                hideSprintName={hideSprintName}
              />
            ))}
          </div>
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-s text-muted-foreground/60">No tasks</p>
          </div>
        )}
      </div>

    </div>
  );
});
