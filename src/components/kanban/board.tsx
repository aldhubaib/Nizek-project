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
import { moveTask as moveTaskAction, declineTask, pollTaskUpdates } from "@/actions/task";
import type { TaskQuestion } from "./question-field";
import { StageConfirmDialog, getCheckpoint } from "./stage-confirm-dialog";
import { DeclineDialog, type DeclineAttachment } from "./decline-dialog";
import { getPusherClient, projectChannel } from "@/lib/pusher-client";
import type { TaskEvent } from "@/lib/pusher";

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
  currentUserId?: string;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
}

export function KanbanBoard({
  initialTasks,
  projectId,
  userRole,
  userPermissions,
  isProjectActive,
  questions,
  currentUserId,
  allowedTaskTypes,
  activeContractType,
}: BoardProps) {
  const { tasks, setTasks, moveTask } = useKanbanStore();
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [pendingMove, setPendingMove] = useState<{ taskId: string; fromStage: Stage; toStage: Stage; order: number } | null>(null);
  const [pendingDecline, setPendingDecline] = useState<{ taskId: string; fromStage: Stage } | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const isDragging = useRef(false);
  const pendingDeclineRef = useRef(false);
  const snapshotRef = useRef<KanbanTask[]>(initialTasks);

  useEffect(() => {
    pendingDeclineRef.current = pendingDecline !== null;
  }, [pendingDecline]);

  useEffect(() => {
    setTasks(initialTasks);
    snapshotRef.current = initialTasks;
  }, [initialTasks, setTasks]);

  const refetchTasks = useCallback(async () => {
    if (isDragging.current || pendingDeclineRef.current || document.hidden) return;
    try {
      const updates = await pollTaskUpdates(projectId);
      setTasks((prev: KanbanTask[]) => {
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        const currentIds = new Set(prev.map((t) => t.id));
        const updateIds = new Set(updates.map((u) => u.id));

        let changed = false;

        const merged = prev.map((task) => {
          const update = updateMap.get(task.id);
          if (!update) { changed = true; return task; }
          if (task.stage !== update.stage || task.order !== update.order || task.title !== update.title || task.priority !== update.priority) {
            changed = true;
            return { ...task, ...update };
          }
          return task;
        }).filter((t) => updateIds.has(t.id));

        for (const u of updates) {
          if (!currentIds.has(u.id)) {
            changed = true;
            merged.push({
              ...u,
              description: null,
              isReadyForTransition: false,
              declineCount: 0,
              internalDeclines: 0,
              clientDeclines: 0,
            } as KanbanTask);
          }
        }

        if (prev.length !== merged.length) changed = true;
        return changed ? merged : prev;
      });
    } catch {
      // Silently ignore
    }
  }, [projectId, setTasks]);

  // Pusher real-time subscription
  useEffect(() => {
    if (!isProjectActive) return;

    const pusher = getPusherClient();
    if (pusher) {
      const channel = pusher.subscribe(projectChannel(projectId));
      channel.bind("task-change", (event: TaskEvent) => {
        if (event.userId === currentUserId) return;
        refetchTasks();
      });

      return () => {
        channel.unbind_all();
        pusher.unsubscribe(projectChannel(projectId));
      };
    }

    const interval = setInterval(refetchTasks, 30_000);
    return () => clearInterval(interval);
  }, [projectId, isProjectActive, currentUserId, refetchTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const canMoveFromTo = useCallback(
    (from: Stage, to: Stage) => {
      if (!isProjectActive) return false;
      if (userPermissions.isAdmin) return true;
      if (!userPermissions.canMoveTask) return false;
      const allowed = userPermissions.allowedTransitions?.[from];
      return allowed ? allowed.includes(to) : false;
    },
    [userPermissions, isProjectActive]
  );

  const canSkipClientReview = userPermissions.isAdmin || (
    userPermissions.canMoveTask &&
    (userPermissions.allowedTransitions?.["INTERNAL_REVIEW"] ?? []).includes("READY_FOR_RELEASE")
  );

  function isDeclineMove(fromStage: Stage, toStage: Stage) {
    return (
      (fromStage === "INTERNAL_REVIEW" && toStage === "IN_DEVELOPMENT") ||
      (fromStage === "CLIENT_REVIEW" && toStage === "INTERNAL_REVIEW")
    );
  }

  function isValidMove(fromStage: Stage, toStage: Stage) {
    const fromIdx = STAGES.findIndex((s) => s.id === fromStage);
    const toIdx = STAGES.findIndex((s) => s.id === toStage);
    if (toIdx === fromIdx + 1) return true;
    if (fromStage === "INTERNAL_REVIEW" && toStage === "READY_FOR_RELEASE") return true;
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
    isDragging.current = true;
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
      if (fromStage === "INTERNAL_REVIEW" && targetStage === "CLIENT_REVIEW" && activeTaskItem.taskType === "BUG") {
        effectiveTarget = "READY_FOR_RELEASE";
      }
      if (!canMoveFromTo(fromStage, effectiveTarget)) return;
      if (!isValidMove(fromStage, effectiveTarget)) return;
      if (fromStage === "CLARIFICATION" && !canLeaveClarRef.current) return;
      const tasksInTarget = tasks.filter((t) => t.stage === effectiveTarget);
      moveTask(activeId, effectiveTarget, tasksInTarget.length);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    isDragging.current = false;
    const fromStage = dragOriginRef.current;
    setActiveTask(null);
    dragOriginRef.current = null;

    const { active, over } = event;
    if (!over || !fromStage) {
      setTasks(snapshotRef.current);
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
      if (fromStage === "INTERNAL_REVIEW" && dropStage === "CLIENT_REVIEW" && task.taskType === "BUG") {
        effectiveDrop = "READY_FOR_RELEASE";
      }
      if (!canMoveFromTo(fromStage, effectiveDrop)) {
        setTasks(snapshotRef.current);
        const fromLabel = STAGES.find((s) => s.id === fromStage)?.label ?? fromStage;
        const toLabel = STAGES.find((s) => s.id === effectiveDrop)?.label ?? effectiveDrop;
        setPermissionError(`You don't have permission to move tasks from "${fromLabel}" to "${toLabel}".`);
        return;
      }
      if (!isValidMove(fromStage, effectiveDrop)) { setTasks(snapshotRef.current); return; }
      if (fromStage === "CLARIFICATION" && !canLeaveClarRef.current) { setTasks(snapshotRef.current); return; }
      targetStage = effectiveDrop;
      const tasksInTarget = tasks.filter((t) => t.stage === effectiveDrop);
      moveTask(activeId, effectiveDrop, tasksInTarget.length);
    } else if (dropStage && dropStage !== task.stage) {
      setTasks(snapshotRef.current);
      return;
    }

    if (fromStage !== targetStage && !isValidMove(fromStage, targetStage)) {
      setTasks(snapshotRef.current);
      return;
    }

    if (fromStage === "CLARIFICATION" && fromStage !== targetStage && !canLeaveClarRef.current) {
      setTasks(snapshotRef.current);
      return;
    }

    if (fromStage === targetStage) {
      executeMoveTask(activeId, targetStage, task.order);
      return;
    }

    if (isDeclineMove(fromStage, targetStage)) {
      setPendingDecline({ taskId: activeId, fromStage });
      return;
    }

    const checkpoint = getCheckpoint(fromStage, targetStage);
    if (checkpoint) {
      setPendingMove({ taskId: activeId, fromStage, toStage: targetStage, order: task.order });
      return;
    }

    executeMoveTask(activeId, targetStage, task.order);
  }

  function executeMoveTask(taskId: string, stage: Stage, order: number, estimatedMinutes?: number) {
    snapshotRef.current = useKanbanStore.getState().tasks;
    moveTaskAction({ taskId, stage, order, estimatedMinutes }).catch((err) => {
      setTasks(snapshotRef.current);
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
      } else if (msg.includes("permission") || msg.includes("Permission")) {
        setPermissionError(msg);
      } else {
        alert(msg || "Failed to move task. Please try again.");
      }
    });
  }

  function handleConfirmMove(estimatedMinutes?: number) {
    if (!pendingMove) return;
    executeMoveTask(pendingMove.taskId, pendingMove.toStage, pendingMove.order, estimatedMinutes);
    setPendingMove(null);
  }

  function handleCancelMove() {
    setTasks(snapshotRef.current);
    setPendingMove(null);
  }

  async function handleConfirmDecline(comment: string, attachments?: DeclineAttachment[]) {
    if (!pendingDecline) return;
    const DECLINE_TARGETS: Record<string, Stage> = {
      INTERNAL_REVIEW: "IN_DEVELOPMENT",
      CLIENT_REVIEW: "INTERNAL_REVIEW",
    };
    const targetStage = DECLINE_TARGETS[pendingDecline.fromStage];
    try {
      await declineTask({ taskId: pendingDecline.taskId, comment, attachments });
      if (targetStage) {
        const targetOrder = tasks.filter((t) => t.stage === targetStage && t.id !== pendingDecline!.taskId).length;
        moveTask(pendingDecline.taskId, targetStage, targetOrder);
        snapshotRef.current = snapshotRef.current.map((t) =>
          t.id === pendingDecline!.taskId ? { ...t, stage: targetStage, order: targetOrder } : t
        );
      }
    } catch (err) {
      console.error(err);
      setTasks(snapshotRef.current);
    }
    setPendingDecline(null);
  }

  function handleCancelDecline() {
    setTasks(snapshotRef.current);
    setPendingDecline(null);
  }

  const tasksByStage = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const stage of STAGES) {
      map[stage.id] = tasks
        .filter((t) => t.stage === stage.id)
        .sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks]);

  if (!isProjectActive) {
    return (
      <div>
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-medium text-amber-400">
            No active contract — this project is read-only. Add a new contract to re-enable editing.
          </p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)] scrollbar-hidden">
          {STAGES.map((stage) => {
            const stageTasks = tasksByStage[stage.id] ?? [];
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                tasks={stageTasks}
                disabled
                projectId={projectId}
                questions={questions}
                isAdmin={userPermissions.isAdmin}
                canSkipClientReview={canSkipClientReview}
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
          const stageTasks = tasksByStage[stage.id] ?? [];
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              tasks={stageTasks}
              projectId={projectId}
              questions={questions}
              canCreateTask={userPermissions.isAdmin || (userPermissions.createStages ?? []).includes(stage.id)}
              dragFromStage={dragFromStage}
              dragTaskType={dragTaskType}
              isAdmin={userPermissions.isAdmin}
              canSkipClientReview={canSkipClientReview}
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

      {permissionError && (
        <PermissionDeniedDialog
          message={permissionError}
          onClose={() => setPermissionError(null)}
        />
      )}
    </DndContext>
  );
}

function PermissionDeniedDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-[14px] font-semibold text-foreground">Permission Denied</h3>
        </div>
        <p className="text-[13px] text-muted-foreground mb-1">{message}</p>
        <p className="text-[11px] text-muted-foreground/60 mb-5">The task has been returned to its previous stage.</p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
