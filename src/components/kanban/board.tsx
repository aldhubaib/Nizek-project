"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./column";
import { TaskCard } from "./task-card";
import { useKanbanStore, type KanbanTask, type Stage } from "@/store/kanban";
import { moveTask as moveTaskAction, declineTask, pollTaskUpdates, assignTaskToMe, getBoardTask } from "@/actions/task";
import { useCurrentUser } from "@/components/current-user-provider";
import type { TaskQuestion } from "./question-field";
import { StageConfirmDialog, getCheckpoint } from "./stage-confirm-dialog";
import { ProofOfWorkDialog } from "./proof-of-work-dialog";
import { needsProofOfWork } from "@/lib/proof-of-work";
import { DeclineDialog, type DeclineAttachment } from "./decline-dialog";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { projectChannel } from "@/lib/channels";
import { canTransition } from "@/lib/permissions";
import { stageLabel } from "@/lib/task-label";

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}
import type { UserPermissions } from "@/app/(dashboard)/dashboard/projects/[projectId]/project-detail-client";

const COLUMN_IDS = new Set<string>([
  "NEW_REQUEST",
  "READY_FOR_DEV",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "DONE",
]);

const columnFirstCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const columnHit = pointerHits.find((hit) => COLUMN_IDS.has(String(hit.id)));
  if (columnHit) return [columnHit];
  return closestCorners(args);
};

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "NEW_REQUEST", label: stageLabel("NEW_REQUEST"), color: "bg-muted-foreground" },
  { id: "READY_FOR_DEV", label: stageLabel("READY_FOR_DEV"), color: "bg-cyan" },
  { id: "IN_DEVELOPMENT", label: stageLabel("IN_DEVELOPMENT"), color: "bg-sky" },
  { id: "INTERNAL_REVIEW", label: stageLabel("INTERNAL_REVIEW"), color: "bg-orange" },
  { id: "CLIENT_REVIEW", label: stageLabel("CLIENT_REVIEW"), color: "bg-orange" },
  { id: "DONE", label: stageLabel("DONE"), color: "bg-success" },
];

export interface BoardProps {
  initialTasks: KanbanTask[];
  projectId: string;
  userRole: string;
  userPermissions: UserPermissions;
  isProjectActive: boolean;
  questions: QuestionWithType[];
  currentUserId?: string;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  /** When set, only this sprint's tasks appear on the board. */
  filterSprintId?: string;
  /** Hide Backlog; used on the Active sprint view. */
  pipelineOnly?: boolean;
  /** Completed sprints: view only, no drag or create. */
  readOnly?: boolean;
  onRemoveFromSprint?: (taskId: string) => void;
}

const BOARD_ROW =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-2 lg:flex-row lg:items-stretch lg:overflow-x-auto lg:overflow-y-hidden lg:overscroll-x-contain";

const ASSIGN_TO_ME_CHECKPOINT = {
  title: "Taking ownership",
  message: "By confirming, this task will be assigned to you and you take ownership of it.",
  confirmLabel: "Assign to Me",
  confirmColor: "bg-primary hover:bg-primary/90",
  assignToMe: true,
} as const;

function visibleStage(
  stage: Stage | undefined | null,
  pipelineOnly = false,
): Stage | undefined {
  if (!stage) return undefined;
  if (pipelineOnly && (stage === "NEW_REQUEST" || stage === "CLARIFICATION")) {
    return "READY_FOR_DEV";
  }
  if (pipelineOnly && stage === "CLIENT_REVIEW") {
    return "INTERNAL_REVIEW";
  }
  if (stage === "CLARIFICATION") return "NEW_REQUEST";
  if (stage === "READY_FOR_RELEASE") return "DONE";
  return stage;
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
  filterSprintId,
  pipelineOnly = false,
  readOnly = false,
  onRemoveFromSprint,
}: BoardProps) {
  // Selector subscriptions so the board only re-renders on task changes, not on
  // unrelated store updates (e.g. commentRefreshKey).
  const storeProjectId = useKanbanStore((s) => s.projectId);
  const storeTasks = useKanbanStore((s) => s.tasks);
  const tasks = storeProjectId === projectId ? storeTasks : initialTasks;
  const setTasks = useKanbanStore((s) => s.setTasks);
  const moveTask = useKanbanStore((s) => s.moveTask);
  const user = useCurrentUser();
  const cent = useCentrifugo();
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [pendingMove, setPendingMove] = useState<{ taskId: string; fromStage: Stage; toStage: Stage; order: number; assigneeName: string | null; assigneeAvatar: string | null } | null>(null);
  const [pendingProof, setPendingProof] = useState<{ taskId: string; taskTitle: string; order: number } | null>(null);
  const [pendingDecline, setPendingDecline] = useState<{ taskId: string; fromStage: Stage; mentionName: string | null; mentionAvatar: string | null } | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ taskId: string; assigneeName: string | null; assigneeAvatar: string | null } | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const isDragging = useRef(false);
  const pendingDeclineRef = useRef(false);
  const snapshotRef = useRef<KanbanTask[]>(initialTasks);

  useEffect(() => {
    pendingDeclineRef.current = pendingDecline !== null;
  }, [pendingDecline]);

  useEffect(() => {
    function onProofFailed(event: Event) {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!taskId) return;
      const snap = snapshotRef.current.find((t) => t.id === taskId);
      if (!snap) return;
      useKanbanStore.getState().updateTask(taskId, { stage: snap.stage, order: snap.order });
    }
    window.addEventListener("proof-upload-failed", onProofFailed);
    return () => window.removeEventListener("proof-upload-failed", onProofFailed);
  }, []);

  useEffect(() => {
    if (isDragging.current) return;
    const store = useKanbanStore.getState();
    if (store.projectId !== projectId) {
      setTasks(initialTasks, projectId);
      snapshotRef.current = initialTasks;
      return;
    }
    if (store.tasks.length === 0 && initialTasks.length > 0) {
      setTasks(initialTasks, projectId);
      snapshotRef.current = initialTasks;
    }
  }, [projectId, initialTasks, setTasks]);

  const refetchTasks = useCallback(async () => {
    if (isDragging.current || pendingDeclineRef.current || document.hidden) return;
    try {
      const updates = await pollTaskUpdates(projectId);
      if (useKanbanStore.getState().projectId !== projectId) return;
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
      }, projectId);
    } catch {
      // Silently ignore
    }
  }, [projectId, setTasks]);

  // Realtime board sync over Centrifugo (consolidated from Pusher). Instead of
  // refetching the whole board on every remote event, patch the single affected
  // task via an O(1) fetch (or remove it on delete).
  const applyRemoteTask = useCallback(
    async (taskId: string) => {
      try {
        const updated = await getBoardTask(taskId, projectId);
        if (useKanbanStore.getState().projectId !== projectId) return;
        if (!updated) {
          useKanbanStore.getState().removeTask(taskId);
          return;
        }
        const dto = updated as unknown as KanbanTask;
        setTasks((prev: KanbanTask[]) => {
          const exists = prev.some((t) => t.id === taskId);
          return exists
            ? prev.map((t) => (t.id === taskId ? dto : t))
            : [...prev, dto];
        }, projectId);
      } catch {
        // Best-effort; the fallback poll (when realtime is off) covers gaps.
      }
    },
    [projectId, setTasks],
  );

  const handleTaskEvent = useCallback(
    (data: unknown) => {
      const ev = data as { type?: string; taskId?: string; userId?: string };
      // The project channel also carries chat payloads — only react to task-*.
      if (!ev?.type || !ev.type.startsWith("task-")) return;
      // Own drags already patched the store. Still apply our own task-moved
      // when we are not dragging — e.g. a bypass we just approved.
      if (ev.userId === currentUserId && (ev.type !== "task-moved" || isDragging.current)) return;
      if (isDragging.current || pendingDeclineRef.current) return;
      if (ev.type === "task-deleted") {
        if (ev.taskId && useKanbanStore.getState().projectId === projectId) {
          useKanbanStore.getState().removeTask(ev.taskId);
        }
        return;
      }
      if (ev.taskId) void applyRemoteTask(ev.taskId);
    },
    [currentUserId, projectId, applyRemoteTask],
  );

  useChannel(
    isProjectActive && cent?.enabled ? projectChannel(projectId) : null,
    handleTaskEvent,
  );

  // Fallback polling only when the realtime transport is unavailable.
  useEffect(() => {
    if (!isProjectActive || cent?.enabled) return;
    const interval = setInterval(refetchTasks, 30_000);
    return () => clearInterval(interval);
  }, [isProjectActive, cent?.enabled, refetchTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Same rule the server applies (src/lib/permissions.ts), so a drag the
  // board allows can't be one the save then rejects — including the bug lane
  // where Internal Review forwards straight to Done.
  const canMoveFromTo = useCallback(
    (from: Stage, to: Stage) =>
      isProjectActive &&
      canTransition(
        {
          isAdmin: userPermissions.isAdmin,
          canMoveTask: userPermissions.canMoveTask,
          allowedTransitions: userPermissions.allowedTransitions ?? {},
        },
        from,
        to,
      ),
    [userPermissions, isProjectActive]
  );

  const canSkipClientReview = canTransition(
    {
      isAdmin: userPermissions.isAdmin,
      canMoveTask: userPermissions.canMoveTask,
      allowedTransitions: userPermissions.allowedTransitions ?? {},
    },
    "INTERNAL_REVIEW",
    "DONE",
  );

  // Claim a task by clicking its avatar — offered when the viewer can move it at
  // its current stage (admins always qualify), and it isn't already theirs.
  const canSelfAssign = useCallback(
    (task: KanbanTask) => {
      if (!isProjectActive) return false;
      if (userPermissions.isAdmin) return true;
      if (!userPermissions.canMoveTask) return false;
      const allowed = userPermissions.allowedTransitions?.[task.stage];
      return Array.isArray(allowed) && allowed.length > 0;
    },
    [userPermissions, isProjectActive]
  );

  const openSelfAssign = useCallback((task: KanbanTask) => {
    setAssignTarget({
      taskId: task.id,
      assigneeName: task.assignee?.name ?? null,
      assigneeAvatar: task.assignee?.imageUrl ?? null,
    });
  }, []);

  function handleConfirmAssign() {
    if (!assignTarget) return;
    const { taskId } = assignTarget;
    setAssignTarget(null);
    const snapshot = useKanbanStore.getState().tasks;
    setTasks(
      snapshot.map((t) =>
        t.id === taskId
          ? {
              ...t,
              assignee: {
                id: currentUserId ?? "",
                name: user?.name || null,
                imageUrl: user?.imageUrl ?? null,
              },
            }
          : t
      ),
      projectId,
    );
    assignTaskToMe(taskId).then((result) => {
      if (!result.success) {
        setTasks(snapshot, projectId);
        setPermissionError(result.error || "Failed to assign task. Please try again.");
      }
    });
  }

  const boardStages = useMemo(
    () =>
      pipelineOnly
        ? STAGES.filter((s) => s.id !== "NEW_REQUEST" && s.id !== "CLIENT_REVIEW")
        : STAGES,
    [pipelineOnly],
  );
  const stageOnBoard = (stage: Stage | undefined | null) => visibleStage(stage, pipelineOnly);

  function isDeclineMove(fromStage: Stage, toStage: Stage) {
    return (
      (fromStage === "INTERNAL_REVIEW" && toStage === "IN_DEVELOPMENT") ||
      (fromStage === "CLIENT_REVIEW" && toStage === "INTERNAL_REVIEW")
    );
  }

  function isValidMove(fromStage: Stage, toStage: Stage) {
    const fromIdx = boardStages.findIndex((s) => s.id === fromStage);
    const toIdx = boardStages.findIndex((s) => s.id === toStage);
    if (toIdx === fromIdx + 1) return true;
    if (fromStage === "INTERNAL_REVIEW" && toStage === "DONE") return true;
    if (isDeclineMove(fromStage, toStage)) return true;
    return false;
  }

  const dragOriginRef = useRef<Stage | null>(null);
  const canLeaveBacklogRef = useRef(false);

  const dragFromStage = useMemo(() => {
    if (!activeTask) return null;
    return dragOriginRef.current;
  }, [activeTask]);

  const dragTaskType = activeTask?.taskType ?? null;

  function handleDragStart(event: DragStartEvent) {
    isDragging.current = true;
    snapshotRef.current = useKanbanStore.getState().tasks;
    const task = useKanbanStore.getState().tasks.find((t) => t.id === event.active.id);
    if (task) {
      const origin = stageOnBoard(task.stage) ?? task.stage;
      dragOriginRef.current = origin;
      canLeaveBacklogRef.current =
        origin === "NEW_REQUEST" ? Boolean(task.isReadyForTransition) : false;
      setActiveTask(task);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    isDragging.current = false;
    const fromStage = dragOriginRef.current;
    setActiveTask(null);
    dragOriginRef.current = null;

    const { active, over } = event;
    if (!over || !fromStage) {
      setTasks(snapshotRef.current, projectId);
      return;
    }

    const activeId = active.id as string;
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    const overId = over.id as string;
    const dropStage = stageOnBoard(
      boardStages.find((s) => s.id === overId)?.id ?? tasks.find((t) => t.id === overId)?.stage,
    );

    // Determine the effective target stage (either from optimistic move or direct drop)
    let targetStage = stageOnBoard(task.stage) ?? task.stage;
    if (stageOnBoard(task.stage) === fromStage && dropStage && dropStage !== fromStage) {
      let effectiveDrop = dropStage;
      if (fromStage === "INTERNAL_REVIEW" && dropStage === "CLIENT_REVIEW" && task.taskType === "BUG") {
        effectiveDrop = "DONE";
      }
      if (!canMoveFromTo(fromStage, effectiveDrop)) {
        setTasks(snapshotRef.current, projectId);
        const fromLabel = STAGES.find((s) => s.id === fromStage)?.label ?? fromStage;
        const toLabel = STAGES.find((s) => s.id === effectiveDrop)?.label ?? effectiveDrop;
        setPermissionError(`You don't have permission to move tasks from "${fromLabel}" to "${toLabel}".`);
        return;
      }
      if (!isValidMove(fromStage, effectiveDrop)) { setTasks(snapshotRef.current, projectId); return; }
      if (fromStage === "NEW_REQUEST" && !canLeaveBacklogRef.current) { setTasks(snapshotRef.current, projectId); return; }
      targetStage = effectiveDrop;
      const tasksInTarget = tasks.filter((t) => stageOnBoard(t.stage) === effectiveDrop);
      moveTask(activeId, effectiveDrop, tasksInTarget.length);
    } else if (dropStage && dropStage !== stageOnBoard(task.stage)) {
      setTasks(snapshotRef.current, projectId);
      return;
    }

    if (fromStage !== targetStage && !isValidMove(fromStage, targetStage)) {
      setTasks(snapshotRef.current, projectId);
      return;
    }

    if (fromStage === "NEW_REQUEST" && fromStage !== targetStage && !canLeaveBacklogRef.current) {
      setTasks(snapshotRef.current, projectId);
      return;
    }

    if (fromStage === targetStage) {
      executeMoveTask(activeId, targetStage, task.order);
      return;
    }

    if (isDeclineMove(fromStage, targetStage)) {
      setPendingDecline({ taskId: activeId, fromStage, mentionName: task.assignee?.name ?? null, mentionAvatar: task.assignee?.imageUrl ?? null });
      return;
    }

    if (needsProofOfWork(fromStage, targetStage)) {
      setPendingProof({ taskId: activeId, taskTitle: task.title, order: task.order });
      return;
    }

    const checkpoint = getCheckpoint(fromStage, targetStage);
    if (checkpoint) {
      setPendingMove({ taskId: activeId, fromStage, toStage: targetStage, order: task.order, assigneeName: task.assignee?.name ?? null, assigneeAvatar: task.assignee?.imageUrl ?? null });
      return;
    }

    executeMoveTask(activeId, targetStage, task.order);
  }

  function executeMoveTask(taskId: string, stage: Stage, order: number, estimatedMinutes?: number) {
    snapshotRef.current = useKanbanStore.getState().tasks;
    moveTaskAction({ taskId, stage, order, estimatedMinutes }).then((result) => {
      if (result.success) return;
      setTasks(snapshotRef.current, projectId);
      const msg = result.error;
      if (msg.startsWith("REQUIRED_QUESTIONS:")) {
        try {
          const missing = JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""));
          alert(`Cannot move task — answer these required questions first:\n\n${missing.map((q: string) => `• ${q}`).join("\n")}`);
        } catch {
          alert("Cannot move task — some required questions are unanswered.");
        }
      } else if (msg === "PROOF_REQUIRED") {
        const current = useKanbanStore.getState().tasks.find((t) => t.id === taskId);
        setPendingProof({ taskId, taskTitle: current?.title ?? "Task", order });
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
    setTasks(snapshotRef.current, projectId);
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
      const result = await declineTask({ taskId: pendingDecline.taskId, comment, attachments });
      if (!result.success) {
        alert(`Failed to decline task: ${result.error}`);
        setTasks(snapshotRef.current, projectId);
        setPendingDecline(null);
        return;
      }
      if (targetStage) {
        const targetOrder = tasks.filter((t) => t.stage === targetStage && t.id !== pendingDecline!.taskId).length;
        moveTask(pendingDecline.taskId, targetStage, targetOrder);
        snapshotRef.current = snapshotRef.current.map((t) =>
          t.id === pendingDecline!.taskId ? { ...t, stage: targetStage, order: targetOrder } : t
        );
      }
      useKanbanStore.getState().triggerCommentRefresh();
    } catch (err) {
      console.error(err);
      alert(`Failed to decline task: ${(err as Error).message}`);
      setTasks(snapshotRef.current, projectId);
    }
    setPendingDecline(null);
  }

  function handleCancelDecline() {
    setTasks(snapshotRef.current, projectId);
    setPendingDecline(null);
  }

  const visibleTasks = useMemo(
    () => (filterSprintId ? tasks.filter((t) => t.sprintId === filterSprintId) : tasks),
    [tasks, filterSprintId],
  );

  const tasksByStage = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const stage of boardStages) {
      map[stage.id] = visibleTasks
        .filter((t) => stageOnBoard(t.stage) === stage.id)
        .sort((a, b) => a.order - b.order);
    }
    return map;
  }, [visibleTasks, boardStages]);

  if (!isProjectActive || readOnly) {
    return (
      <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
        {!isProjectActive && (
        <div className="mb-6 shrink-0 rounded-lg border border-orange/30 bg-orange/10 px-4 py-3">
          <p className="text-s font-medium text-orange">
            No active contract — this project is read-only. Add a new contract to re-enable editing.
          </p>
        </div>
        )}
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <div className={BOARD_ROW}>
          {boardStages.map((stage) => {
            const stageTasks = tasksByStage[stage.id] ?? [];
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                tasks={stageTasks}
                disabled
                projectId={projectId}
                pipelineOnly={pipelineOnly}
              />
            );
          })}
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
    <DndContext
      sensors={sensors}
      collisionDetection={columnFirstCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Stacked on small screens; from lg up columns stay 400px and the row scrolls sideways. */}
      <div className={BOARD_ROW}>
        {boardStages.map((stage) => {
          const stageTasks = tasksByStage[stage.id] ?? [];
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              tasks={stageTasks}
              projectId={projectId}
              canCreateTask={
                !filterSprintId &&
                !pipelineOnly &&
                (userPermissions.isAdmin || (userPermissions.createStages ?? []).includes(stage.id))
              }
              dragFromStage={dragFromStage}
              dragTaskType={dragTaskType}
              canSelfAssign={canSelfAssign}
              onSelfAssign={openSelfAssign}
              onRemoveFromSprint={onRemoveFromSprint}
              hideSprintName={Boolean(filterSprintId || pipelineOnly)}
              pipelineOnly={pipelineOnly}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} isOverlay hideSprintName={Boolean(filterSprintId || pipelineOnly)} /> : null}
      </DragOverlay>

      {pendingProof ? (
        <ProofOfWorkDialog
          target={pendingProof}
          projectId={projectId}
          onSubmitted={() => setPendingProof(null)}
          onCancel={() => {
            setTasks(snapshotRef.current, projectId);
            setPendingProof(null);
          }}
        />
      ) : null}

      {pendingMove && (() => {
        const checkpoint = getCheckpoint(pendingMove.fromStage, pendingMove.toStage);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            currentAssigneeName={pendingMove.assigneeName}
            currentAssigneeAvatar={pendingMove.assigneeAvatar}
            onConfirm={handleConfirmMove}
            onCancel={handleCancelMove}
          />
        ) : null;
      })()}

      {pendingDecline && (
        <DeclineDialog
          fromStage={pendingDecline.fromStage}
          mentionName={pendingDecline.mentionName}
          mentionAvatar={pendingDecline.mentionAvatar}
          onConfirm={handleConfirmDecline}
          onCancel={handleCancelDecline}
        />
      )}

      {assignTarget && (
        <StageConfirmDialog
          checkpoint={ASSIGN_TO_ME_CHECKPOINT}
          currentAssigneeName={assignTarget.assigneeName}
          currentAssigneeAvatar={assignTarget.assigneeAvatar}
          onConfirm={handleConfirmAssign}
          onCancel={() => setAssignTarget(null)}
        />
      )}

      {permissionError && (
        <PermissionDeniedDialog
          message={permissionError}
          onClose={() => setPermissionError(null)}
        />
      )}
    </DndContext>
    </div>
  );
}

function PermissionDeniedDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-s font-semibold text-foreground">Permission Denied</h3>
        </div>
        <p className="text-s text-muted-foreground mb-1">{message}</p>
        <p className="text-xs text-muted-foreground/60 mb-5">The task has been returned to its previous stage.</p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-s font-medium hover:bg-primary/90 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
