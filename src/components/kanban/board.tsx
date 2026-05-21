"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./column";
import { TaskCard } from "./task-card";
import { useKanbanStore, type KanbanTask, type Stage } from "@/store/kanban";
import { moveTask as moveTaskAction, declineTask } from "@/actions/task";
import type { TaskQuestion } from "./question-field";
import { StageConfirmDialog, getCheckpoint } from "./stage-confirm-dialog";
import { DeclineDialog } from "./decline-dialog";

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}
import type { UserPermissions } from "@/app/(dashboard)/dashboard/projects/[projectId]/project-detail-client";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "NEW_REQUEST", label: "New Request", color: "bg-zinc-500" },
  { id: "CLARIFICATION", label: "Clarification", color: "bg-violet-500" },
  { id: "READY_FOR_DEV", label: "Ready for Dev", color: "bg-blue-500" },
  { id: "IN_DEVELOPMENT", label: "In Development", color: "bg-sky-500" },
  { id: "INTERNAL_REVIEW", label: "Internal Review", color: "bg-amber-500" },
  { id: "CLIENT_REVIEW", label: "Client Review", color: "bg-orange-500" },
  { id: "READY_FOR_RELEASE", label: "Ready for Release", color: "bg-teal-500" },
  { id: "DONE", label: "Done", color: "bg-emerald-500" },
];

interface BoardProps {
  initialTasks: KanbanTask[];
  projectId: string;
  userRole: string;
  userPermissions: UserPermissions;
  isProjectActive: boolean;
  questions: QuestionWithType[];
}

export function KanbanBoard({
  initialTasks,
  projectId,
  userRole,
  userPermissions,
  isProjectActive,
  questions,
}: BoardProps) {
  const { tasks, setTasks, moveTask } = useKanbanStore();
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [pendingMove, setPendingMove] = useState<{ taskId: string; fromStage: Stage; toStage: Stage; order: number } | null>(null);
  const [pendingDecline, setPendingDecline] = useState<{ taskId: string; fromStage: Stage } | null>(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks, setTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const canMoveToStage = useCallback(
    (stage: Stage) => {
      if (!isProjectActive) return false;
      if (userPermissions.isAdmin) return true;
      if (!userPermissions.canMoveTask) return false;
      return userPermissions.allowedStages.includes(stage);
    },
    [userPermissions, isProjectActive]
  );

  function isDeclineMove(fromStage: Stage, toStage: Stage) {
    return (
      (fromStage === "INTERNAL_REVIEW" && toStage === "IN_DEVELOPMENT") ||
      (fromStage === "CLIENT_REVIEW" && toStage === "INTERNAL_REVIEW")
    );
  }

  function isValidMove(fromStage: Stage, toStage: Stage, taskType?: string) {
    const fromIdx = STAGES.findIndex((s) => s.id === fromStage);
    const toIdx = STAGES.findIndex((s) => s.id === toStage);
    if (toIdx === fromIdx + 1) return true;
    if (taskType === "BUG" && fromStage === "INTERNAL_REVIEW" && toStage === "READY_FOR_RELEASE") return true;
    if (isDeclineMove(fromStage, toStage)) return true;
    return false;
  }

  const dragOriginRef = useRef<Stage | null>(null);
  const canLeaveClarRef = useRef(false);

  const dragFromStage = useMemo(() => {
    if (!activeTask) return null;
    return dragOriginRef.current;
  }, [activeTask]);

  const dragTaskType = activeTask?.taskType ?? null;

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      dragOriginRef.current = task.stage;
      if (task.stage === "CLARIFICATION") {
        const ready = tasks
          .filter((t) => t.stage === "CLARIFICATION" && t.isReadyForTransition)
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        canLeaveClarRef.current = ready[0]?.id === task.id;
      } else {
        canLeaveClarRef.current = false;
      }
      setActiveTask(task);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const fromStage = dragOriginRef.current;
    if (!fromStage) return;

    const activeTaskItem = tasks.find((t) => t.id === activeId);
    if (!activeTaskItem) return;

    const overStage = STAGES.find((s) => s.id === overId)?.id;
    const overTask = tasks.find((t) => t.id === overId);
    const targetStage = overStage ?? overTask?.stage;

    if (targetStage && targetStage !== activeTaskItem.stage) {
      let effectiveTarget = targetStage;
      if (activeTaskItem.taskType === "BUG" && fromStage === "INTERNAL_REVIEW" && targetStage === "CLIENT_REVIEW") {
        effectiveTarget = "READY_FOR_RELEASE";
      }
      if (!canMoveToStage(effectiveTarget)) return;
      if (!isValidMove(fromStage, effectiveTarget, activeTaskItem.taskType)) return;
      if (fromStage === "CLARIFICATION" && !canLeaveClarRef.current) return;
      const tasksInTarget = tasks.filter((t) => t.stage === effectiveTarget);
      moveTask(activeId, effectiveTarget, tasksInTarget.length);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const fromStage = dragOriginRef.current;
    setActiveTask(null);
    dragOriginRef.current = null;

    const { active, over } = event;
    if (!over || !fromStage) {
      setTasks(initialTasks);
      return;
    }

    const activeId = active.id as string;
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    const overId = over.id as string;
    const dropStage = STAGES.find((s) => s.id === overId)?.id ?? tasks.find((t) => t.id === overId)?.stage;

    // Determine the effective target stage (either from optimistic move or direct drop)
    let targetStage = task.stage;
    if (task.stage === fromStage && dropStage && dropStage !== fromStage) {
      let effectiveDrop = dropStage;
      if (task.taskType === "BUG" && fromStage === "INTERNAL_REVIEW" && dropStage === "CLIENT_REVIEW") {
        effectiveDrop = "READY_FOR_RELEASE";
      }
      if (!canMoveToStage(effectiveDrop)) { setTasks(initialTasks); return; }
      if (!isValidMove(fromStage, effectiveDrop, task.taskType)) { setTasks(initialTasks); return; }
      if (fromStage === "CLARIFICATION" && !canLeaveClarRef.current) { setTasks(initialTasks); return; }
      targetStage = effectiveDrop;
      const tasksInTarget = tasks.filter((t) => t.stage === effectiveDrop);
      moveTask(activeId, effectiveDrop, tasksInTarget.length);
    } else if (dropStage && dropStage !== task.stage) {
      setTasks(initialTasks);
      return;
    }

    if (fromStage !== targetStage && !isValidMove(fromStage, targetStage, task.taskType)) {
      setTasks(initialTasks);
      return;
    }

    if (fromStage === "CLARIFICATION" && fromStage !== targetStage && !canLeaveClarRef.current) {
      setTasks(initialTasks);
      return;
    }

    if (fromStage === targetStage) {
      await executeMoveTask(activeId, targetStage, task.order);
      return;
    }

    // Decline move — show decline dialog
    if (isDeclineMove(fromStage, targetStage)) {
      setPendingDecline({ taskId: activeId, fromStage });
      return;
    }

    const checkpoint = getCheckpoint(fromStage, targetStage);
    if (checkpoint) {
      setPendingMove({ taskId: activeId, fromStage, toStage: targetStage, order: task.order });
      return;
    }

    await executeMoveTask(activeId, targetStage, task.order);
  }

  async function executeMoveTask(taskId: string, stage: Stage, order: number, estimatedMinutes?: number) {
    try {
      await moveTaskAction({ taskId, stage, order, estimatedMinutes });
    } catch (err) {
      setTasks(initialTasks);
      const msg = (err as Error).message;
      if (msg.startsWith("REQUIRED_QUESTIONS:")) {
        try {
          const missing = JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""));
          alert(`Cannot move task — answer these required questions first:\n\n${missing.map((q: string) => `• ${q}`).join("\n")}`);
        } catch {
          alert("Cannot move task — some required questions are unanswered.");
        }
      } else if (msg.startsWith("PRIORITY_BLOCKED:")) {
        try {
          const blocking = JSON.parse(msg.replace("PRIORITY_BLOCKED:", ""));
          alert(`Cannot move — higher priority tasks must be completed first:\n\n${blocking.map((t: string) => `• ${t}`).join("\n")}`);
        } catch {
          alert("Cannot move — higher priority tasks must be completed first.");
        }
      } else if (msg === "ESTIMATE_REQUIRED") {
        alert("An estimated time is required before moving to Ready for Dev.");
      } else {
        alert(msg || "Failed to move task. Please try again.");
      }
    }
  }

  function handleConfirmMove(estimatedMinutes?: number) {
    if (!pendingMove) return;
    executeMoveTask(pendingMove.taskId, pendingMove.toStage, pendingMove.order, estimatedMinutes);
    setPendingMove(null);
  }

  function handleCancelMove() {
    setTasks(initialTasks);
    setPendingMove(null);
  }

  async function handleConfirmDecline(comment: string) {
    if (!pendingDecline) return;
    try {
      await declineTask({ taskId: pendingDecline.taskId, comment });
    } catch (err) {
      console.error(err);
      setTasks(initialTasks);
    }
    setPendingDecline(null);
  }

  function handleCancelDecline() {
    setTasks(initialTasks);
    setPendingDecline(null);
  }

  if (!isProjectActive) {
    return (
      <div>
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-400">
            Contract expired — this project is read-only. Add a new contract to
            re-enable editing.
          </p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)] scrollbar-hidden">
          {STAGES.map((stage) => {
            const stageTasks = tasks
              .filter((t) => t.stage === stage.id)
              .sort((a, b) => a.order - b.order);
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                tasks={stageTasks}
                disabled
                projectId={projectId}
                questions={questions}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)] scrollbar-hidden">
        {STAGES.map((stage) => {
          const stageTasks = tasks
            .filter((t) => t.stage === stage.id)
            .sort((a, b) => a.order - b.order);
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              tasks={stageTasks}
              projectId={projectId}
              questions={questions}
              canCreateTask={userPermissions.canCreateTask || userPermissions.isAdmin}
              dragFromStage={dragFromStage}
              dragTaskType={dragTaskType}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
      </DragOverlay>

      {pendingMove && (() => {
        const checkpoint = getCheckpoint(pendingMove.fromStage, pendingMove.toStage);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={handleConfirmMove}
            onCancel={handleCancelMove}
          />
        ) : null;
      })()}

      {pendingDecline && (
        <DeclineDialog
          fromStage={pendingDecline.fromStage}
          onConfirm={handleConfirmDecline}
          onCancel={handleCancelDecline}
        />
      )}
    </DndContext>
  );
}
