"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, MoreHorizontal, Pause, Play } from "lucide-react";
import { RoadmapTaskRow, SprintTaskRow } from "@/components/project/sprint-task-row";
import {
  deleteSprint,
  ensureSprintForColumn,
  getSprintPlanFlags,
  getSprintSnapshots,
  listSprints,
  reorderPlannedSprints,
  setSprintBoardStatus,
  setTaskSprint,
  startSprint,
  type SprintDTO,
  type SprintSnapshotTask,
} from "@/actions/sprint";
import { moveTask as moveTaskAction } from "@/actions/task";
import { isMissingDataTask } from "@/lib/task-readiness";
import { promoteToBacklogBottom } from "@/lib/backlog-placement";
import { fieldsClearedByMove, moveNeedsReason } from "@/lib/sprint-task-move";
import { AddToActiveSprintDialog } from "@/components/project/add-to-active-sprint-dialog";
import { RemoveFromSprintDialog } from "@/components/project/remove-from-sprint-dialog";
import { CollapsibleSection } from "@/components/project/collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/equity/confirm-delete-dialog";
import { ConfirmShipSprintDialog } from "@/components/project/confirm-ship-sprint-dialog";
import {
  SPRINT_BOARD_COLUMNS,
  compareClosedSprints,
  comparePlannedSprints,
  isClosedSprint,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { statusDot } from "@/lib/task-label";
import { cn } from "@/lib/utils";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { useProjectTaskSync } from "@/components/kanban/use-project-task-sync";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";
import { ClientSprintCard } from "@/components/project/client-sprint-card";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";

const COLUMN_IDS = new Set<string>(SPRINT_BOARD_COLUMNS.map((c) => c.id));
const BACKLOG_ZONE = "backlog";
const MISSING_ZONE = "missing-data";
const TASK_ZONES = new Set([BACKLOG_ZONE, MISSING_ZONE, "PLANNED", "NEXT"]);
const SPRINT_CARD_COLUMNS = new Set<SprintBoardColumn>(["ACTIVE", "COMPLETED", "SHIPPED"]);

const COLUMN_HEADER_CLASS =
  "flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-3";

const boardCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const draggingSprint = String(args.active.id).startsWith("sprint:");

  if (draggingSprint) {
    const sprintHit = pointerHits.find((hit) => String(hit.id).startsWith("sprint:"));
    if (sprintHit) return [sprintHit];
    const columnHit = pointerHits.find((hit) => COLUMN_IDS.has(String(hit.id)));
    if (columnHit) return [columnHit];
    return closestCorners(args);
  }

  const sprintHit = pointerHits.find((hit) => String(hit.id).startsWith("sprint:"));
  if (sprintHit) return [sprintHit];
  const taskHit = pointerHits.find((hit) => {
    const id = String(hit.id);
    return (
      id !== String(args.active.id) &&
      !id.startsWith("sprint:") &&
      !COLUMN_IDS.has(id) &&
      !TASK_ZONES.has(id)
    );
  });
  if (taskHit) return [taskHit];
  const zoneHit = pointerHits.find((hit) => TASK_ZONES.has(String(hit.id)));
  if (zoneHit) return [zoneHit];
  const columnHit = pointerHits.find((hit) => COLUMN_IDS.has(String(hit.id)));
  if (columnHit) return [columnHit];
  return closestCorners(args);
};

interface Props {
  projectId: string;
  sprints: SprintDTO[];
  onSprintsChange: Dispatch<SetStateAction<SprintDTO[]>>;
  initialTasks: KanbanTask[];
  canManage: boolean;
  canMoveTasks?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canCreateSprintPlanning?: boolean;
  /** Admins alone may edit a sprint document after the sprint has closed. */
  isAdmin?: boolean;
  isProjectActive: boolean;
  hideAssignees?: boolean;
  /** Board is as wide as its columns; a parent scroller moves sideways. */
  embedInScrollParent?: boolean;
  /**
   * Staff viewer id. Its presence opts this roadmap into realtime updates:
   * `project:` is a staff-only namespace, so the client panel leaves it unset.
   */
  currentUserId?: string;
}

function sprintDragId(id: string) {
  return `sprint:${id}`;
}

function sprintIdFromDrag(id: string) {
  return id.startsWith("sprint:") ? id.slice("sprint:".length) : "";
}

export function CompletedSprintsTab({
  projectId,
  sprints,
  onSprintsChange,
  initialTasks,
  canManage,
  canMoveTasks = false,
  canStartSprint = false,
  canEndSprint = false,
  canCreateSprintPlanning = false,
  isAdmin = false,
  isProjectActive,
  hideAssignees = false,
  embedInScrollParent = false,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<SprintDTO | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<Record<string, SprintSnapshotTask[]> | null>(null);
  const storeTasks = useKanbanStore((s) => s.tasks);
  const storeProjectId = useKanbanStore((s) => s.projectId);
  const setTasks = useKanbanStore((s) => s.setTasks);
  const updateTask = useKanbanStore((s) => s.updateTask);
  const liveTasks = storeProjectId === projectId && storeTasks.length > 0 ? storeTasks : initialTasks;
  const taskById = useMemo(() => new Map(liveTasks.map((t) => [t.id, t])), [liveTasks]);
  const [notice, setNotice] = useState<string | null>(null);
  const [addToActive, setAddToActive] = useState<{
    task: KanbanTask;
    sprint: SprintDTO;
  } | null>(null);
  // Which tasks already carry a Decision or Risk, so a drag that would discard
  // them can say so before it happens.
  const [planFlags, setPlanFlags] = useState<
    Record<string, { decision: boolean; risk: boolean }>
  >({});
  const [confirmMove, setConfirmMove] = useState<{
    task: KanbanTask;
    nextSprintId: string | null;
    estimatedMinutes?: number | null;
    fromSprintName: string;
    toLabel: string;
    clearedFields: string[];
    requireReason: boolean;
    /** Already collected by the add dialog, when that is what led here. */
    reason?: string;
  } | null>(null);
  // One document per sprint, so one panel: planning it, reviewing it and
  // reading it back afterwards are the same document at different ages.
  const [docSprint, setDocSprint] = useState<SprintDTO | null>(null);
  const [shipConfirm, setShipConfirm] = useState<SprintDTO | null>(null);
  const [openTask, setOpenTask] = useState<{ id: string; title: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canDrag = canManage && isProjectActive;
  const canDragTasks = canMoveTasks && isProjectActive;
  const activeSprint = useMemo(() => {
    if (!activeId?.startsWith("sprint:")) return null;
    return sprints.find((s) => s.id === activeId.slice("sprint:".length)) ?? null;
  }, [activeId, sprints]);

  // The roadmap reads the same kanban store as the board, and that store is
  // only as live as its subscribers — without this, another user's edits sit
  // unseen until a manual refresh.
  const activeIdRef = useRef<string | null>(null);
  const onSprintsChangeRef = useRef(onSprintsChange);
  const sprintReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
    onSprintsChangeRef.current = onSprintsChange;
  });

  const reloadPlanFlags = useCallback(() => {
    void getSprintPlanFlags(projectId).then(setPlanFlags).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    reloadPlanFlags();
  }, [reloadPlanFlags]);

  // Sprint payloads carry no sprint body, and starting a sprint fires several
  // at once, so coalesce them into one list read.
  const reloadSprints = useCallback(() => {
    if (sprintReloadTimer.current) return;
    sprintReloadTimer.current = setTimeout(() => {
      sprintReloadTimer.current = null;
      void listSprints(projectId)
        .then((next) => onSprintsChangeRef.current(next))
        .catch(() => {});
      reloadPlanFlags();
    }, 250);
  }, [projectId, reloadPlanFlags]);

  useEffect(
    () => () => {
      if (sprintReloadTimer.current) clearTimeout(sprintReloadTimer.current);
    },
    [],
  );

  useProjectTaskSync({
    projectId,
    enabled: Boolean(currentUserId) && isProjectActive,
    currentUserId,
    isDragging: () => activeIdRef.current !== null,
    onSprintEvent: reloadSprints,
  });

  const closeDoc = useCallback(() => {
    setDocSprint(null);
    router.refresh();
  }, [router]);

  const closedCount = sprints.filter((s) => isClosedSprint(s.status)).length;

  useEffect(() => {
    const store = useKanbanStore.getState();
    if (store.projectId !== projectId || store.tasks.length === 0) {
      setTasks(initialTasks, projectId);
      return;
    }
    setTasks((prev) => {
      const incoming = new Map(initialTasks.map((t) => [t.id, t]));
      return prev.map((t) => {
        const next = incoming.get(t.id);
        if (!next || t.isReadyForTransition === next.isReadyForTransition) return t;
        return { ...t, isReadyForTransition: next.isReadyForTransition };
      });
    }, projectId);
  }, [initialTasks, projectId, setTasks]);

  useEffect(() => {
    if (closedCount > 0 && snapshots === null) {
      getSprintSnapshots(projectId).then(setSnapshots);
    }
  }, [closedCount, projectId, snapshots]);

  const missingTasks = useMemo(
    () =>
      liveTasks
        .filter((t) => !t.sprintId && t.stage !== "DONE" && isMissingDataTask(t))
        .sort((a, b) => a.order - b.order),
    [liveTasks],
  );
  const backlogTasks = useMemo(
    () =>
      liveTasks
        .filter((t) => !t.sprintId && t.stage !== "DONE" && !isMissingDataTask(t))
        .sort((a, b) => a.order - b.order),
    [liveTasks],
  );
  const plannedSprintIds = useMemo(
    () => new Set(sprints.filter((s) => s.status === "PLANNED").map((s) => s.id)),
    [sprints],
  );
  const nextSprint = useMemo(
    () => sprints.find((s) => s.status === "NEXT") ?? null,
    [sprints],
  );
  const plannedTasks = useMemo(
    () =>
      liveTasks
        .filter((t) => t.sprintId && plannedSprintIds.has(t.sprintId) && t.stage !== "DONE")
        .sort((a, b) => a.order - b.order),
    [liveTasks, plannedSprintIds],
  );
  const nextTasks = useMemo(
    () =>
      liveTasks
        .filter((t) => t.sprintId && t.sprintId === nextSprint?.id && t.stage !== "DONE")
        .sort((a, b) => a.order - b.order),
    [liveTasks, nextSprint],
  );

  const prevReadyRef = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    const prev = prevReadyRef.current;
    const next = new Map<string, boolean>();
    for (const task of liveTasks) {
      const isReady = Boolean(task.isReadyForTransition);
      next.set(task.id, isReady);
      if (prev.size === 0) continue;
      if (prev.get(task.id) === false && isReady) {
        promoteToBacklogBottom(task.id);
      }
    }
    prevReadyRef.current = next;
  }, [liveTasks]);

  const byColumn = useMemo(() => {
    const groups: Record<SprintBoardColumn, SprintDTO[]> = {
      PLANNED: [],
      NEXT: [],
      ACTIVE: [],
      COMPLETED: [],
      SHIPPED: [],
    };
    for (const sprint of sprints) {
      groups[sprintBoardColumn(sprint.status)].push(sprint);
    }
    groups.PLANNED.sort(comparePlannedSprints);
    groups.COMPLETED.sort(compareClosedSprints);
    groups.SHIPPED.sort(compareClosedSprints);
    return groups;
  }, [sprints]);

  function tasksForSprint(sprintId: string): SprintSnapshotTask[] {
    if (snapshots && snapshots[sprintId]) {
      return snapshots[sprintId];
    }
    return liveTasks
      .filter((t) => t.sprintId === sprintId)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        taskId: t.id,
        title: t.title,
        taskNumber: t.taskNumber,
        taskType: t.taskType,
        stage: t.stage,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes ?? null,
        incompleteReason: null,
        assignee: t.assignee ?? null,
      }));
  }

  function applySprint(next: SprintDTO) {
    onSprintsChange((prev) => prev.map((s) => (s.id === next.id ? { ...s, ...next } : s)));
    window.dispatchEvent(new CustomEvent("sprint-status-changed", { detail: next }));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function nextSprintCount(task: KanbanTask, nextSprintId: string | null): number {
    const current = task.sprintCount ?? 0;
    const hadSprint = Boolean(task.sprintId);
    const willHaveSprint = Boolean(nextSprintId);
    if (!hadSprint && willHaveSprint) return current + 1;
    if (hadSprint && !willHaveSprint) return Math.max(0, current - 1);
    return current;
  }

  function bumpSprintCount(sprintId: string | null, delta: number) {
    if (!sprintId) return;
    onSprintsChange((prev) =>
      prev.map((s) =>
        s.id === sprintId ? { ...s, taskCount: Math.max(0, s.taskCount + delta) } : s,
      ),
    );
  }

  function assignTaskToSprint(
    task: KanbanTask,
    nextSprintId: string | null,
    estimatedMinutes?: number | null,
    reason?: string,
  ) {
    if (nextSprintId && isClosedSprint(sprints.find((s) => s.id === nextSprintId)?.status ?? "")) {
      return;
    }
    const prevSprintId = task.sprintId ?? null;
    if (prevSprintId === nextSprintId) return;

    const plan = prevSprintId ? planFlags[`${prevSprintId}:${task.id}`] : undefined;
    const clearedFields = fieldsClearedByMove(
      { fromSprintId: prevSprintId, toSprintId: nextSprintId },
      {
        hasDecision: Boolean(plan?.decision),
        hasRisk: Boolean(plan?.risk),
        hasEstimate: Boolean(task.estimatedMinutes),
        hasAssignee: Boolean(task.assignee),
      },
    );
    // Leaving a running sprint always stops to ask, even when there is nothing
    // to discard: the sprint document reports the departure and needs a reason
    // to print beside it.
    const fromSprint = prevSprintId ? sprints.find((s) => s.id === prevSprintId) : null;
    const requireReason = moveNeedsReason({
      fromSprintStatus: fromSprint?.status ?? null,
      // A move *into* a running sprint was explained by the add dialog already,
      // so this one only asks about the sprint being left.
      toSprintStatus: null,
    });
    if (clearedFields.length > 0 || requireReason) {
      const target = nextSprintId ? sprints.find((s) => s.id === nextSprintId) : null;
      setConfirmMove({
        task,
        nextSprintId,
        estimatedMinutes,
        fromSprintName: fromSprint?.name ?? task.sprintName ?? "the sprint",
        toLabel: target?.name ?? "Backlog",
        clearedFields,
        requireReason,
        reason,
      });
      return;
    }

    performAssignTaskToSprint(task, nextSprintId, estimatedMinutes, reason);
  }

  function performAssignTaskToSprint(
    task: KanbanTask,
    nextSprintId: string | null,
    estimatedMinutes?: number | null,
    reason?: string,
  ) {
    const prevSprintId = task.sprintId ?? null;
    const sprintName = nextSprintId
      ? (sprints.find((s) => s.id === nextSprintId)?.name ?? null)
      : null;
    const prevSprintCount = task.sprintCount;
    updateTask(task.id, {
      sprintId: nextSprintId,
      sprintName,
      sprintCount: nextSprintCount(task, nextSprintId),
      ...(nextSprintId
        ? {
            stage: "BACKLOG",
            ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
          }
        : { assignee: null, estimatedMinutes: null }),
    });
    bumpSprintCount(prevSprintId, -1);
    bumpSprintCount(nextSprintId, 1);
    startTransition(async () => {
      try {
        await setTaskSprint(task.id, nextSprintId, estimatedMinutes, reason);
        // The departing task's Decision and Risk are gone now, so the warning
        // must stop offering to protect them.
        reloadPlanFlags();
        router.refresh();
      } catch (err) {
        updateTask(task.id, {
          sprintId: prevSprintId,
          sprintName: task.sprintName ?? null,
          sprintCount: prevSprintCount,
          assignee: task.assignee,
          estimatedMinutes: task.estimatedMinutes,
        });
        bumpSprintCount(nextSprintId, -1);
        bumpSprintCount(prevSprintId, 1);
        setError(err instanceof Error ? err.message : "Could not move task");
      }
    });
  }

  /**
   * The sprint in a column, created on the server if the column is empty.
   *
   * Deliberately not decided from local props: two people dragging into an empty
   * column both saw it empty and each created their own sprint, and the board
   * only ever renders one of them.
   */
  async function ensureColumnSprint(column: "PLANNED" | "NEXT"): Promise<SprintDTO> {
    const sprint = await ensureSprintForColumn(projectId, column);
    onSprintsChange((prev) =>
      prev.some((s) => s.id === sprint.id) ? prev.map((s) => (s.id === sprint.id ? sprint : s)) : [...prev, sprint],
    );
    return sprint;
  }

  function reorderBacklog(list: KanbanTask[], activeTaskId: string, overTaskId: string) {
    const oldIndex = list.findIndex((t) => t.id === activeTaskId);
    const newIndex = list.findIndex((t) => t.id === overTaskId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const reordered = arrayMove(list, oldIndex, newIndex);
    const updates = reordered
      .map((t, order) => ({ task: t, order }))
      .filter(({ task, order }) => task.order !== order);
    if (updates.length === 0) return;
    for (const { task, order } of updates) {
      updateTask(task.id, { order });
    }
    startTransition(async () => {
      const results = await Promise.all(
        updates.map(({ task, order }) =>
          moveTaskAction({ taskId: task.id, stage: task.stage, order }),
        ),
      );
      if (results.some((r) => !r.success)) {
        setError("Could not reorder tasks");
        router.refresh();
      }
    });
  }

  function resolveTaskDropSprint(overId: string): SprintDTO | null {
    const fromSprintId = sprintIdFromDrag(overId);
    if (fromSprintId) {
      return sprints.find((s) => s.id === fromSprintId) ?? null;
    }
    if (overId === "NEXT") {
      return nextSprint;
    }
    if (overId === "PLANNED") {
      return sprints.filter((s) => s.status === "PLANNED").slice().sort(comparePlannedSprints)[0] ?? null;
    }
    if (overId === "ACTIVE") {
      return sprints.find((s) => s.status === "ACTIVE") ?? null;
    }
    const overTask = taskById.get(overId);
    if (overTask?.sprintId) {
      return sprints.find((s) => s.id === overTask.sprintId) ?? null;
    }
    return null;
  }

  function handleTaskDragEnd(task: KanbanTask, overId: string) {
    if (overId === MISSING_ZONE) return;

    if (overId === BACKLOG_ZONE || backlogTasks.some((t) => t.id === overId)) {
      if (isMissingDataTask(task)) {
        setNotice(
          "This task still has missing data. Fill in all required fields before moving it to the Backlog.",
        );
        return;
      }
      if (backlogTasks.some((t) => t.id === overId) && !task.sprintId) {
        reorderBacklog(backlogTasks, task.id, overId);
        return;
      }
      if (!task.sprintId) return;
      assignTaskToSprint(task, null);
      return;
    }

    const inPlanned = Boolean(task.sprintId && plannedSprintIds.has(task.sprintId));
    const inNext = Boolean(nextSprint && task.sprintId === nextSprint.id);
    if (overId === "PLANNED" || plannedTasks.some((t) => t.id === overId)) {
      if (isMissingDataTask(task)) {
        setNotice(
          "This task still has missing data. Fill in all required fields before planning it.",
        );
        return;
      }
      if (plannedTasks.some((t) => t.id === overId) && inPlanned) {
        reorderBacklog(plannedTasks, task.id, overId);
        return;
      }
      const existing = resolveTaskDropSprint("PLANNED");
      if (existing) {
        assignTaskToSprint(task, existing.id);
        return;
      }
      startTransition(async () => {
        try {
          const sprint = await ensureColumnSprint("PLANNED");
          assignTaskToSprint(task, sprint.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add task to Planned");
        }
      });
      return;
    }
    if (overId === "NEXT" || nextTasks.some((t) => t.id === overId)) {
      if (isMissingDataTask(task)) {
        setNotice(
          "This task still has missing data. Fill in all required fields before adding it to Next.",
        );
        return;
      }
      if (nextTasks.some((t) => t.id === overId) && inNext) {
        reorderBacklog(nextTasks, task.id, overId);
        return;
      }
      if (nextSprint) {
        assignTaskToSprint(task, nextSprint.id);
        return;
      }
      startTransition(async () => {
        try {
          const sprint = await ensureColumnSprint("NEXT");
          assignTaskToSprint(task, sprint.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add task to Next");
        }
      });
      return;
    }

    const target = resolveTaskDropSprint(overId);
    if (!target) {
      return;
    }
    if (isClosedSprint(target.status)) return;
    if (isMissingDataTask(task)) {
      setNotice(
        "This task still has missing data. Fill in all required fields before planning it into a sprint.",
      );
      return;
    }
    if (target.status === "ACTIVE" && task.sprintId !== target.id) {
      setAddToActive({ task, sprint: target });
      return;
    }
    assignTaskToSprint(task, target.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    if (!activeId.startsWith("sprint:")) {
      if (!canDragTasks) return;
      const task = taskById.get(activeId);
      if (task) handleTaskDragEnd(task, String(over.id));
      return;
    }
    if (!canDrag) return;
    const sprintId = sprintIdFromDrag(activeId);
    const sprint = sprints.find((s) => s.id === sprintId);
    if (!sprint) return;

    const overId = String(over.id);
    const overSprintId = sprintIdFromDrag(overId);
    const overSprint = overSprintId
      ? sprints.find((s) => s.id === overSprintId)
      : undefined;
    const fromColumn = sprintBoardColumn(sprint.status);
    const columnId = overSprint ? sprintBoardColumn(overSprint.status) : overId;
    if (!COLUMN_IDS.has(columnId)) return;
    const column = columnId as SprintBoardColumn;

    if (fromColumn === "PLANNED" && column === "PLANNED" && overSprint) {
      const plannedIds = sprints
        .filter((s) => sprintBoardColumn(s.status) === "PLANNED")
        .slice()
        .sort(comparePlannedSprints)
        .map((s) => s.id);
      const oldIndex = plannedIds.indexOf(sprint.id);
      const newIndex = plannedIds.indexOf(overSprint.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const nextIds = arrayMove(plannedIds, oldIndex, newIndex);
      const previousOrders = new Map(sprints.map((s) => [s.id, s.sortOrder]));
      setError(null);
      onSprintsChange((prev) => {
        const order = new Map(nextIds.map((id, i) => [id, i]));
        return prev.map((s) =>
          order.has(s.id) ? { ...s, sortOrder: order.get(s.id)! } : s,
        );
      });
      startTransition(async () => {
        try {
          await reorderPlannedSprints(projectId, nextIds);
          router.refresh();
        } catch (err) {
          onSprintsChange((prev) =>
            prev.map((s) =>
              previousOrders.has(s.id)
                ? { ...s, sortOrder: previousOrders.get(s.id)! }
                : s,
            ),
          );
          setError(err instanceof Error ? err.message : "Could not reorder sprints");
        }
      });
      return;
    }

    if (fromColumn === column) return;

    if (column === "NEXT") {
      const occupant = sprints.find((s) => s.status === "NEXT" && s.id !== sprint.id);
      if (occupant) {
        setError(`Next already has "${occupant.name}". Move it first.`);
        return;
      }
    }

    const previous = sprint;
    setError(null);

    // Defer so dnd-kit can unmount the overlay before this card changes columns.
    window.setTimeout(() => {
      if (column === "ACTIVE") {
        applySprint({ ...sprint, status: "ACTIVE" });
        startTransition(async () => {
          try {
            applySprint(await startSprint(sprint.id));
            router.refresh();
          } catch (err) {
            applySprint(previous);
            setError(err instanceof Error ? err.message : "Could not start sprint");
          }
        });
        return;
      }

      if (sprint.status === "ACTIVE") {
        setDocSprint(sprint);
        return;
      }

      // Shipping is the client accepting the sprint, so it is confirmed rather
      // than done on the drop. Every other move is immediate. Narrowed to the
      // move the server actually allows, so an invalid drag still fails on its
      // own rather than asking anyone to take responsibility first.
      if (column === "SHIPPED" && fromColumn === "COMPLETED") {
        setShipConfirm(sprint);
        return;
      }

      moveSprintToColumn(sprint, column);
    }, 0);
  }

  function moveSprintToColumn(sprint: SprintDTO, column: SprintBoardColumn) {
    const previous = sprint;
    const optimisticStatus =
      column === "COMPLETED"
        ? (sprint.incompleteReason ? "PARTIALLY_COMPLETED" : "COMPLETED")
        : column;
    applySprint({ ...sprint, status: optimisticStatus });
    startTransition(async () => {
      try {
        applySprint(await setSprintBoardStatus(sprint.id, column));
        router.refresh();
      } catch (err) {
        applySprint(previous);
        setError(err instanceof Error ? err.message : "Could not move sprint");
      }
    });
  }

  async function confirmDelete(typed: string) {
    const sprint = deletingSprint;
    if (!sprint) return;
    setError(null);
    await deleteSprint(sprint.id, typed);
    for (const task of useKanbanStore.getState().tasks) {
      if (task.sprintId === sprint.id) {
        updateTask(task.id, { sprintId: null, sprintName: null, assignee: null });
      }
    }
    onSprintsChange((prev) => prev.filter((s) => s.id !== sprint.id));
    setSnapshots((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[sprint.id];
      return next;
    });
    router.refresh();
  }

  const overlayTask = activeId && !activeId.startsWith("sprint:")
    ? taskById.get(activeId) ?? null
    : null;

  return (
    <div
      className={
        embedInScrollParent
          ? "flex min-h-0 w-full flex-col gap-4 lg:h-full lg:w-max"
          : "flex w-full min-w-0 flex-col gap-4 lg:min-h-0 lg:flex-1"
      }
    >
      {error ? <p className="text-s text-destructive">{error}</p> : null}
      {notice ? <MissingDataNotice message={notice} onClose={() => setNotice(null)} /> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollision}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div
          className={
            embedInScrollParent
              ? "flex w-full flex-col gap-4 pb-4 lg:h-full lg:min-h-0 lg:w-max lg:flex-row"
              : "flex w-full flex-col gap-4 pb-4 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-row lg:overflow-x-auto lg:overflow-y-hidden lg:overscroll-x-contain"
          }
        >
          <TaskPoolColumn
            id={MISSING_ZONE}
            title="Missing data"
            count={missingTasks.length}
            color={statusDot("MISSING_DATA")}
            emptyLabel="No tasks with missing data."
          >
            <div className="space-y-2">
              {missingTasks.map((task) => (
                <SprintTaskRow
                  key={task.id}
                  as="button"
                  hideAssignee
                  disableHoverBorder
                  task={task}
                  onClick={() => setOpenTask({ id: task.id, title: task.title })}
                />
              ))}
            </div>
          </TaskPoolColumn>
          <TaskPoolColumn
            id={BACKLOG_ZONE}
            title="Backlog"
            count={backlogTasks.length}
            color={statusDot("BACKLOG")}
            emptyLabel="Drag completed items here. Higher in the list is higher priority."
          >
            <SortableContext
              items={backlogTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {backlogTasks.map((task) => (
                  <BacklogTaskRow
                    key={task.id}
                    task={task}
                    disabled={!canDragTasks}
                    onOpen={() => setOpenTask({ id: task.id, title: task.title })}
                  />
                ))}
              </div>
            </SortableContext>
          </TaskPoolColumn>
          <TaskPoolColumn
            id="PLANNED"
            title="Planned"
            count={plannedTasks.length}
            color={statusDot("PLANNED")}
            emptyLabel="Drop ready tasks here."
          >
            <SortableContext
              items={plannedTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {plannedTasks.map((task) => (
                  <BacklogTaskRow
                    key={task.id}
                    task={task}
                    disabled={!canDragTasks}
                    onOpen={() => setOpenTask({ id: task.id, title: task.title })}
                  />
                ))}
              </div>
            </SortableContext>
          </TaskPoolColumn>
          <TaskPoolColumn
            id="NEXT"
            title="Next"
            count={nextTasks.length}
            color={statusDot("NEXT")}
            emptyLabel="Drop tasks here to include them in the next sprint."
            action={
              (canStartSprint || canCreateSprintPlanning) && isProjectActive ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!nextSprint) {
                      setError("Add at least one task to Next, then start the sprint.");
                      return;
                    }
                    setDocSprint(nextSprint);
                  }}
                  aria-label="Start sprint"
                  title="Start sprint"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Play className="size-4" />
                </button>
              ) : null
            }
          >
            <SortableContext
              items={nextTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {nextTasks.map((task) => (
                  <BacklogTaskRow
                    key={task.id}
                    task={task}
                    disabled={!canDragTasks}
                    onOpen={() => setOpenTask({ id: task.id, title: task.title })}
                  />
                ))}
              </div>
            </SortableContext>
          </TaskPoolColumn>
          {SPRINT_BOARD_COLUMNS.filter((column) => SPRINT_CARD_COLUMNS.has(column.id)).map((column) => {
            const cards = byColumn[column.id].map((sprint) => {
              const items = tasksForSprint(sprint.id);
              const isCollapsed = collapsed[sprint.id] ?? true;
              if (hideAssignees) {
                return (
                  <ClientSprintCard
                    key={sprint.id}
                    sprint={sprint}
                    taskCount={items.length}
                    onOpen={() => setDocSprint(sprint)}
                  />
                );
              }
              return (
                <SprintBoardCard
                  key={sprint.id}
                  sprint={sprint}
                  items={items}
                  collapsed={isCollapsed}
                  canDrag={canDrag}
                  canManage={canManage}
                  isProjectActive={isProjectActive}
                  onToggle={() =>
                    setCollapsed((c) => ({ ...c, [sprint.id]: !isCollapsed }))
                  }
                  onOpenDoc={() => setDocSprint(sprint)}
                  onDelete={() => setDeletingSprint(sprint)}
                  onOpenTask={(task) =>
                    setOpenTask({ id: task.taskId, title: task.title })
                  }
                  // Work leaves a running sprint the same way it joined one:
                  // dragged back to Next, Planned or the backlog.
                  canDragTaskOut={canDragTasks && !isClosedSprint(sprint.status)}
                />
              );
            });
            return (
            <SprintColumn
              key={column.id}
              column={column}
              sprints={byColumn[column.id]}
              emptyLabel="Drop a sprint here."
              action={
                column.id === "ACTIVE" && canEndSprint && isProjectActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      const active = byColumn.ACTIVE[0];
                      if (!active) {
                        setError("Start a sprint before opening the review.");
                        return;
                      }
                      setDocSprint(active);
                    }}
                    aria-label="Sprint review"
                    title="Sprint review"
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pause className="size-4" />
                  </button>
                ) : null
              }
            >
              {cards}
            </SprintColumn>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeSprint ? (
            <div className="rounded-lg border border-border/50 bg-card px-3 py-4 text-s font-semibold shadow-lg">
              {activeSprint.name} ({tasksForSprint(activeSprint.id).length})
            </div>
          ) : overlayTask ? (
            <SprintTaskRow
              task={overlayTask}
              hideAssignee
              className="border-primary/40 bg-card shadow-xl"
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    {/* Keyed so the dialog remounts on a new target and drops the previous
        task's state. Namespaced per dialog because these are siblings: a shared
        "idle" sentinel collides whenever both are closed, which is most of the
        time. */}
    <AddToActiveSprintDialog
      key={addToActive ? `add:${addToActive.task.id}` : "add:idle"}
      open={addToActive != null}
      projectId={projectId}
      sprintName={addToActive?.sprint.name ?? ""}
      task={addToActive?.task ?? null}
      onOpenChange={(open) => {
        if (!open) setAddToActive(null);
      }}
      onConfirm={(reason) => {
        if (!addToActive) return;
        const pendingAdd = addToActive;
        setAddToActive(null);
        assignTaskToSprint(pendingAdd.task, pendingAdd.sprint.id, undefined, reason);
      }}
    />
    <RemoveFromSprintDialog
      key={confirmMove ? `move:${confirmMove.task.id}:${confirmMove.nextSprintId ?? "backlog"}` : "move:idle"}
      open={confirmMove != null}
      projectId={projectId}
      task={confirmMove?.task ?? null}
      fromSprintName={confirmMove?.fromSprintName ?? ""}
      toLabel={confirmMove?.toLabel ?? ""}
      clearedFields={confirmMove?.clearedFields ?? []}
      requireReason={confirmMove?.requireReason ?? false}
      onOpenChange={(open) => {
        if (!open) setConfirmMove(null);
      }}
      onConfirm={(reason) => {
        if (!confirmMove) return;
        const pendingMove = confirmMove;
        setConfirmMove(null);
        performAssignTaskToSprint(
          pendingMove.task,
          pendingMove.nextSprintId,
          pendingMove.estimatedMinutes,
          // This dialog only asks when the sprint being left has started. On a
          // move into a running sprint the add dialog asked instead, and that
          // is the answer the server wants.
          reason || pendingMove.reason,
        );
      }}
    />
    {deletingSprint ? (
      <ConfirmDeleteDialog
        key={deletingSprint.id}
        open
        onOpenChange={(open) => {
          if (!open) setDeletingSprint(null);
        }}
        title={`Delete ${deletingSprint.name}?`}
        description="This cannot be undone. The sprint record and its snapshots will be removed."
        confirmWord={deletingSprint.name}
        confirmLabel="Delete sprint"
        onConfirm={confirmDelete}
      />
    ) : null}
    <ConfirmShipSprintDialog
      open={shipConfirm !== null}
      sprintName={shipConfirm?.name ?? ""}
      onOpenChange={(open) => {
        if (!open) setShipConfirm(null);
      }}
      onConfirm={() => {
        const sprint = shipConfirm;
        setShipConfirm(null);
        if (sprint) moveSprintToColumn(sprint, "SHIPPED");
      }}
    />

    {openTask ? (
      <TaskInboxSlideOver
        taskId={openTask.id}
        title={openTask.title}
        onClose={() => setOpenTask(null)}
      />
    ) : null}
    {docSprint ? (
      <NoteSlideOver title={docSprint.name} onClose={closeDoc}>
        <NoteFullScreenCreate
          key={docSprint.id}
          projectId={projectId}
          createTypes={["SPRINT_DOC"]}
          initialTitle={docSprint.name}
          sprintId={docSprint.id}
          sprintStatus={docSprint.status}
          isAdmin={isAdmin}
          canStartSprint={canStartSprint}
          canEndSprint={canEndSprint}
          canCreateSprintPlanning={canCreateSprintPlanning}
          hideAssignees={hideAssignees}
          onCancel={closeDoc}
          autoFocusTitle={false}
          saveInHeader={false}
          onCreated={() => {}}
        />
      </NoteSlideOver>
    ) : null}
    </div>
  );
}

function TaskPoolColumn({
  id,
  title,
  count,
  color,
  emptyLabel,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  color: string;
  emptyLabel: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full max-h-[70dvh] shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 lg:h-full lg:max-h-none lg:min-h-0 lg:w-[400px] lg:self-stretch",
        isOver && "border-success/60 bg-success/5",
      )}
    >
      <div className={COLUMN_HEADER_CLASS}>
        <div className={cn("h-2.5 w-2.5 rounded-full", color)} />
        <h3 className="text-s font-medium">{title}</h3>
        <span className="text-s text-muted-foreground">{count}</span>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * A task inside a sprint card, draggable back out of it.
 *
 * The columns to the left hold loose tasks; a started sprint holds them inside
 * its own card, which is why these rows had no way out. Dragging one to Next,
 * Planned or the backlog is the same move the loose rows already make, so it
 * lands in the same handler and gets the same warning about what it discards.
 */
function SprintCardTaskRow({
  task,
  disabled,
  incomplete,
  onOpen,
}: {
  task: SprintSnapshotTask;
  disabled: boolean;
  incomplete: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.taskId,
    disabled,
  });
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  return (
    <RoadmapTaskRow
      ref={setNodeRef}
      task={task}
      missingData={false}
      incomplete={incomplete}
      incompleteReason={task.incompleteReason}
      {...attributes}
      {...listeners}
      // The sprint card around this row is itself a drag handle, so without
      // this the one press would pick up the sprint as well as the task.
      onPointerDown={(e) => {
        listeners?.onPointerDown?.(e);
        e.stopPropagation();
      }}
      onClick={() => {
        if (wasDragged.current) {
          wasDragged.current = false;
          return;
        }
        onOpen();
      }}
      className={cn(
        isDragging && "opacity-50",
        disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
      )}
    />
  );
}

function BacklogTaskRow({
  task,
  disabled,
  onOpen,
}: {
  task: KanbanTask;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  return (
    <SprintTaskRow
      ref={setNodeRef}
      task={task}
      hideAssignee
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (wasDragged.current) {
          wasDragged.current = false;
          return;
        }
        onOpen();
      }}
      className={cn(
        isDragging && "opacity-50",
        disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
      )}
    />
  );
}

function MissingDataNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange/15">
            <AlertCircle className="size-5 text-orange" strokeWidth={2} />
          </div>
          <h3 className="text-s font-semibold text-foreground">Missing data</h3>
        </div>
        <p className="mb-5 text-s text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-primary py-2 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function SprintColumn({
  column,
  sprints,
  emptyLabel,
  dropBlocked,
  action,
  children,
}: {
  column: (typeof SPRINT_BOARD_COLUMNS)[number];
  sprints: SprintDTO[];
  emptyLabel: string;
  dropBlocked?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Stacked full-width on mobile; 400px columns beside each other from lg.
        "flex w-full max-h-[70dvh] shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 lg:h-full lg:max-h-none lg:min-h-0 lg:w-[400px] lg:self-stretch",
        isOver && !dropBlocked && "border-success/60 bg-success/5",
        isOver && dropBlocked && "border-destructive/50 bg-destructive/5",
      )}
    >
      <div className={COLUMN_HEADER_CLASS}>
        <div className={cn("h-2.5 w-2.5 rounded-full", statusDot(column.id))} />
        <h3 className="text-s font-medium">{column.label}</h3>
        <span className="text-s text-muted-foreground">{sprints.length}</span>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {sprints.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function SprintBoardCard({
  sprint,
  items,
  collapsed,
  canDrag,
  canManage,
  isProjectActive,
  canDragTaskOut,
  onToggle,
  onOpenDoc,
  onDelete,
  onOpenTask,
}: {
  sprint: SprintDTO;
  items: SprintSnapshotTask[];
  collapsed: boolean;
  canDrag: boolean;
  canManage: boolean;
  isProjectActive: boolean;
  /** Off while the sprint is closed, or for anyone who cannot move tasks. */
  canDragTaskOut: boolean;
  onToggle: () => void;
  onOpenDoc: () => void;
  onDelete: () => void;
  onOpenTask: (task: SprintSnapshotTask) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sprintDragId(sprint.id),
    disabled: !canDrag,
    animateLayoutChanges: () => false,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      <CollapsibleSection
        title={`${sprint.name} (${items.length})`}
        collapsed={collapsed}
        onToggle={onToggle}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Sprint options"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpenDoc}>
                Sprint document
              </DropdownMenuItem>
              {canManage && isProjectActive ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={onDelete}
                >
                  Delete sprint
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No tasks recorded for this sprint.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((task) => (
              <SprintCardTaskRow
                key={task.id}
                task={task}
                disabled={!canDragTaskOut}
                incomplete={
                  Boolean(task.incompleteReason) ||
                  (isClosedSprint(sprint.status) && task.stage !== "DONE")
                }
                onOpen={() => onOpenTask(task)}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
