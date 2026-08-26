"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, useRef, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
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
import { AlertCircle, ClipboardCheck, GripVertical, MoreHorizontal, Play, Plus } from "lucide-react";
import { SprintStatusControl } from "@/components/project/sprint-status-control";
import { SprintTaskRow, TaskTypeCountSummary } from "@/components/project/sprint-task-row";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/add-button";
import { CollapsibleSection } from "@/components/project/collapsible-section";
import { PageHeaderActions } from "@/components/page-header-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditSprintDialog } from "@/components/project/edit-sprint-dialog";
import { AddToActiveSprintDialog } from "@/components/project/add-to-active-sprint-dialog";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { ConfirmDeleteDialog } from "@/components/equity/confirm-delete-dialog";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { cn } from "@/lib/utils";
import {
  createSprint,
  deleteSprint,
  reorderPlannedSprints,
  setTaskSprint,
  type SprintDTO,
} from "@/actions/sprint";
import { moveTask as moveTaskAction } from "@/actions/task";
import { isMissingDataTask } from "@/lib/task-readiness";
import { promoteToBacklogBottom } from "@/lib/backlog-placement";
import { isClosedSprint, isUnstartedSprint, comparePlannedSprints } from "@/lib/sprint-status";

import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";

const BACKLOG_ZONE = "backlog";
const MISSING_ZONE = "missing-data";
const PLANNED_GROUP = "planned-group";
const SPRINT_BLOCK_PREFIX = "sprint-block:";

function sprintBlockId(sprintId: string) {
  return `${SPRINT_BLOCK_PREFIX}${sprintId}`;
}

function nextSprintName(sprints: SprintDTO[]): string {
  let max = 0;
  for (const sprint of sprints) {
    const match = sprint.name.match(/^Sprint\s+(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Sprint ${max + 1}`;
}

function defaultDates() {
  const start = new Date();
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 13);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function sprintZoneId(sprintId: string) {
  return `sprint:${sprintId}`;
}

function parseZone(
  overId: string | undefined,
  taskById: Map<string, KanbanTask>,
  completedSprintIds: Set<string>,
): string | null {
  if (!overId) return null;
  if (overId === BACKLOG_ZONE || overId === MISSING_ZONE) return overId;
  if (overId.startsWith("sprint:")) {
    const sprintId = overId.slice("sprint:".length);
    if (completedSprintIds.has(sprintId)) return null;
    return overId;
  }
  const task = taskById.get(overId);
  if (!task) return null;
  if (task.sprintId) {
    if (completedSprintIds.has(task.sprintId)) return null;
    return sprintZoneId(task.sprintId);
  }
  return isMissingDataTask(task) ? MISSING_ZONE : BACKLOG_ZONE;
}

function TaskRow({
  task,
  projectId,
  disabled,
}: {
  task: KanbanTask;
  projectId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  return (
    <SprintTaskRow
      ref={setNodeRef}
      task={task}
      hideAssignee
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (wasDragged.current) {
          wasDragged.current = false;
          return;
        }
        router.push(`/dashboard/projects/${projectId}/tasks/${task.id}`);
      }}
      className={cn(
        isDragging && "opacity-50",
        disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
      )}
    />
  );
}

function DropList({
  id,
  taskIds,
  empty,
  dragging,
  dropZone,
  children,
}: {
  id: string;
  taskIds: string[];
  empty: string;
  dragging?: boolean;
  dropZone?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  if (!dropZone) {
    return (
      <div
        ref={setNodeRef}
        className={cn("flex flex-col", isOver && "rounded-md bg-primary/10")}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {taskIds.length === 0 ? (
            <p className="px-2 py-12 text-center text-s text-muted-foreground">{empty}</p>
          ) : (
            <div className="space-y-1.5">{children}</div>
          )}
        </SortableContext>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={cn("flex flex-col gap-1.5", isOver && "rounded-md bg-primary/10")}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {taskIds.length === 0 ? (
          <p className="px-2 py-12 text-center text-s text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-1.5">{children}</div>
        )}
      </SortableContext>
    </div>
  );
}

interface Props {
  projectId: string;
  sprints: SprintDTO[];
  onSprintsChange: Dispatch<SetStateAction<SprintDTO[]>>;
  initialTasks: KanbanTask[];
  isProjectActive: boolean;
  canManage: boolean;
  isAdmin?: boolean;
  canCreateSprintPlanning?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canDeleteSprint?: boolean;
  canCreateTask: boolean;
  onFullscreenChange?: (
    open: boolean,
    opts?: { goBack?: () => void; crumbs?: string[]; title?: string; backLabel?: string },
  ) => void;
  onNoteCreated?: (note: { id: string }) => void;
}

export function BacklogPlanner({
  projectId,
  sprints,
  onSprintsChange,
  initialTasks,
  isProjectActive,
  canManage,
  isAdmin = false,
  canCreateSprintPlanning = false,
  canStartSprint = false,
  canEndSprint = false,
  canDeleteSprint = false,
  canCreateTask,
  onFullscreenChange,
  onNoteCreated,
}: Props) {
  const router = useRouter();
  const setSprints = onSprintsChange;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<SprintDTO | null>(null);
  const [addToActive, setAddToActive] = useState<{
    task: KanbanTask;
    zone: string;
    sprint: SprintDTO;
  } | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<SprintDTO | null>(null);
  const [sprintDoc, setSprintDoc] = useState<{
    sprint: SprintDTO;
    noteType: "SPRINT_PLANNING" | "SPRINT_REVIEW";
  } | null>(null);
  const closeSprintDoc = useCallback(() => {
    setSprintDoc(null);
    router.refresh();
  }, [router]);
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);

  const storeProjectId = useKanbanStore((s) => s.projectId);
  const tasks = useKanbanStore((s) => s.tasks);
  const setTasks = useKanbanStore((s) => s.setTasks);
  const updateTask = useKanbanStore((s) => s.updateTask);

  useEffect(() => {
    const store = useKanbanStore.getState();
    if (store.projectId !== projectId || store.tasks.length === 0) {
      setTasks(initialTasks, projectId);
      return;
    }
    setTasks((prev) => {
      const incoming = new Map(initialTasks.map((t) => [t.id, t]));
      const prevIds = new Set(prev.map((t) => t.id));
      const merged = prev.map((t) => {
        const next = incoming.get(t.id);
        if (!next || t.isReadyForTransition === next.isReadyForTransition) return t;
        return { ...t, isReadyForTransition: next.isReadyForTransition };
      });
      const extra = initialTasks.filter((t) => !prevIds.has(t.id));
      return extra.length === 0 ? merged : [...merged, ...extra];
    }, projectId);
  }, [initialTasks, setTasks, projectId]);

  const cent = useCentrifugo();
  useChannel(
    cent?.enabled && isProjectActive ? projectChannel(projectId) : null,
    useCallback(
      (data: unknown) => {
        const ev = data as { type?: string } | null;
        if (!ev?.type?.startsWith("sprint.") && !ev?.type?.startsWith("task-")) return;
        router.refresh();
      },
      [router],
    ),
  );

  const liveTasks = storeProjectId === projectId ? tasks : initialTasks;
  const taskById = useMemo(() => new Map(liveTasks.map((t) => [t.id, t])), [liveTasks]);

  const openSprints = useMemo(
    () => sprints.filter((s) => !isClosedSprint(s.status)),
    [sprints],
  );
  const activeSprint = openSprints.find((s) => s.status === "ACTIVE") ?? null;
  const plannedSprints = openSprints
    .filter((s) => isUnstartedSprint(s.status))
    .slice()
    .sort(comparePlannedSprints);
  const completedSprintIds = useMemo(
    () => new Set(sprints.filter((s) => isClosedSprint(s.status)).map((s) => s.id)),
    [sprints],
  );

  const unassigned = useMemo(
    () =>
      liveTasks
        .filter((t) => !t.sprintId && t.stage !== "DONE")
        .sort((a, b) => a.order - b.order),
    [liveTasks],
  );
  const completedUnassigned = unassigned.filter((t) => !isMissingDataTask(t));
  const missingUnassigned = unassigned.filter((t) => isMissingDataTask(t));

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const canDrag = canManage && isProjectActive;

  function tasksForSprint(sprintId: string) {
    return liveTasks
      .filter((t) => t.sprintId === sprintId)
      .sort((a, b) => a.order - b.order);
  }

  function bumpCount(sprintId: string | null, delta: number) {
    if (!sprintId) return;
    setSprints((prev) =>
      prev.map((s) =>
        s.id === sprintId ? { ...s, taskCount: Math.max(0, s.taskCount + delta) } : s,
      ),
    );
  }

  async function promoteIfReady(task: KanbanTask, intoActive: boolean) {
    if (!intoActive) return;
    if (task.stage !== "NEW_REQUEST" || !task.isReadyForTransition) return;
    const result = await moveTaskAction({
      taskId: task.id,
      stage: "READY_FOR_DEV",
      order: 0,
    });
    if (result.success) {
      updateTask(task.id, { stage: "READY_FOR_DEV" });
    }
  }

  function nextSprintCount(task: KanbanTask, nextSprintId: string | null): number {
    const current = task.sprintCount ?? 0;
    const hadSprint = Boolean(task.sprintId);
    const willHaveSprint = Boolean(nextSprintId);
    if (!hadSprint && willHaveSprint) return current + 1;
    if (hadSprint && !willHaveSprint) return Math.max(0, current - 1);
    return current;
  }

  function assignToZone(task: KanbanTask, zone: string, estimatedMinutes?: number | null) {
    if (zone === MISSING_ZONE || zone === BACKLOG_ZONE) {
      const nextSprintId = null;
      const prevSprintId = task.sprintId ?? null;
      if (prevSprintId === nextSprintId) return;
      const prevSprintCount = task.sprintCount;
      updateTask(task.id, {
        sprintId: null,
        sprintName: null,
        sprintCount: nextSprintCount(task, null),
        assignee: null,
        estimatedMinutes: null,
      });
      bumpCount(prevSprintId, -1);
      startTransition(async () => {
        try {
          await setTaskSprint(task.id, null);
          router.refresh();
        } catch (err) {
          updateTask(task.id, {
            sprintId: prevSprintId,
            sprintName: task.sprintName ?? null,
            sprintCount: prevSprintCount,
            assignee: task.assignee,
            estimatedMinutes: task.estimatedMinutes,
          });
          bumpCount(prevSprintId, 1);
          setError(err instanceof Error ? err.message : "Could not move task");
        }
      });
      return;
    }

    const nextSprintId = zone.replace(/^sprint:/, "");
    const prevSprintId = task.sprintId ?? null;
    if (prevSprintId === nextSprintId) return;
    if (completedSprintIds.has(nextSprintId)) return;

    const sprintName =
      nextSprintId ? (sprints.find((s) => s.id === nextSprintId)?.name ?? null) : null;
    const intoActive =
      nextSprintId != null &&
      sprints.find((s) => s.id === nextSprintId)?.status === "ACTIVE";
    const prevSprintCount = task.sprintCount;

    updateTask(task.id, {
      sprintId: nextSprintId,
      sprintName,
      estimatedMinutes: estimatedMinutes ?? null,
      stage: "NEW_REQUEST",
      sprintCount: nextSprintCount(task, nextSprintId),
    });
    bumpCount(prevSprintId, -1);
    bumpCount(nextSprintId, 1);

    startTransition(async () => {
      try {
        await setTaskSprint(task.id, nextSprintId, estimatedMinutes ?? null);
        await promoteIfReady(task, Boolean(intoActive));
        router.refresh();
      } catch (err) {
        updateTask(task.id, {
          sprintId: prevSprintId,
          sprintName: task.sprintName ?? null,
          sprintCount: prevSprintCount,
        });
        bumpCount(nextSprintId, -1);
        bumpCount(prevSprintId, 1);
        setError(err instanceof Error ? err.message : "Could not move task");
      }
    });
  }

  function listForZone(zone: string): KanbanTask[] {
    if (zone === BACKLOG_ZONE) return completedUnassigned;
    if (zone === MISSING_ZONE) return missingUnassigned;
    if (zone.startsWith("sprint:")) return tasksForSprint(zone.slice("sprint:".length));
    return [];
  }

  function taskZone(task: KanbanTask): string {
    if (task.sprintId) return sprintZoneId(task.sprintId);
    return isMissingDataTask(task) ? MISSING_ZONE : BACKLOG_ZONE;
  }

  function reorderInZone(zone: string, activeId: string, overId: string) {
    const list = listForZone(zone);
    const oldIndex = list.findIndex((t) => t.id === activeId);
    const newIndex = list.findIndex((t) => t.id === overId);
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

  function handleDragStart(event: DragStartEvent) {
    if (String(event.active.id).startsWith(SPRINT_BLOCK_PREFIX)) {
      setActiveTask(null);
      return;
    }
    setActiveTask(taskById.get(event.active.id as string) ?? null);
  }

  function reorderPlanned(activeId: string, overId: string | undefined) {
    if (!overId) return;
    const fromId = activeId.slice(SPRINT_BLOCK_PREFIX.length);
    let toId = overId.startsWith(SPRINT_BLOCK_PREFIX)
      ? overId.slice(SPRINT_BLOCK_PREFIX.length)
      : overId.startsWith("sprint:")
        ? overId.slice("sprint:".length)
        : taskById.get(overId)?.sprintId ?? null;
    if (!toId || toId === fromId) return;
    const ids = plannedSprints.map((s) => s.id);
    const oldIndex = ids.indexOf(fromId);
    const newIndex = ids.indexOf(toId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    const previous = plannedSprints;
    setSprints((prev) => {
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
        setSprints((prev) =>
          prev.map((s) => previous.find((p) => p.id === s.id) ?? s),
        );
        setError(err instanceof Error ? err.message : "Could not reorder sprints");
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    if (!canDrag) return;
    const activeId = String(event.active.id);
    if (activeId.startsWith(SPRINT_BLOCK_PREFIX)) {
      if (canDrag && canCreateSprintPlanning) {
        reorderPlanned(activeId, event.over?.id as string | undefined);
      }
      return;
    }
    const task = taskById.get(activeId);
    if (!task) return;
    const overId = event.over?.id as string | undefined;
    const zone = parseZone(overId, taskById, completedSprintIds);
    if (!zone) return;

    const fromZone = taskZone(task);
    if (fromZone === zone && overId && overId !== task.id && taskById.has(overId)) {
      reorderInZone(zone, task.id, overId);
      return;
    }
    if (fromZone === zone) return;

    if (zone === BACKLOG_ZONE && isMissingDataTask(task)) {
      setNotice("This task still has missing data. Fill in all required fields before moving it to the Backlog.");
      return;
    }

    if (zone.startsWith("sprint:")) {
      const sprintId = zone.slice("sprint:".length);
      const sprint = sprints.find((s) => s.id === sprintId);
      if (sprint?.status === "ACTIVE" && task.sprintId !== sprint.id) {
        setAddToActive({ task, zone, sprint });
        return;
      }
    }

    assignToZone(task, zone);
  }

  function handleCreate() {
    setError(null);
    const dates = defaultDates();
    startTransition(async () => {
      try {
        const created = await createSprint({
          projectId,
          name: nextSprintName(sprints),
          startDate: dates.startDate,
          endDate: dates.endDate,
        });
        setSprints((prev) => {
          const list = [...prev.filter((s) => s.id !== created.id), created];
          const rank: Record<SprintDTO["status"], number> = {
            ACTIVE: 0,
            NEXT: 1,
            PLANNED: 2,
            COMPLETED: 3,
            PARTIALLY_COMPLETED: 3,
            SHIPPED: 4,
          };
          return list.slice().sort((a, b) => {
            const byStatus = rank[a.status] - rank[b.status];
            if (byStatus !== 0) return byStatus;
            if (isUnstartedSprint(a.status) && isUnstartedSprint(b.status)) {
              return comparePlannedSprints(a, b);
            }
            return 0;
          });
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create sprint");
      }
    });
  }

  function openEdit(sprint: SprintDTO) {
    window.setTimeout(() => setEditing(sprint), 10);
  }

  async function confirmDelete(typed: string) {
    const sprint = deletingSprint;
    if (!sprint) return;
    setError(null);
    await deleteSprint(sprint.id, typed);
    for (const task of useKanbanStore.getState().tasks) {
      if (task.sprintId === sprint.id) {
        updateTask(task.id, {
          sprintId: null,
          sprintName: null,
          estimatedMinutes: null,
          stage: "NEW_REQUEST",
          sprintCount: Math.max(0, (task.sprintCount ?? 1) - 1),
          assignee: null,
        });
      }
    }
    setSprints((prev) => prev.filter((s) => s.id !== sprint.id));
    if (editing?.id === sprint.id) setEditing(null);
    router.refresh();
  }

  function SprintBlock({
    sprint,
    reorderable = false,
  }: {
    sprint: SprintDTO;
    reorderable?: boolean;
  }) {
    const items = tasksForSprint(sprint.id);
    const isCollapsed = collapsed[sprint.id] ?? false;
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: sprintBlockId(sprint.id),
      disabled: !reorderable,
    });
    const typeSummary = <TaskTypeCountSummary tasks={items} />;

    return (
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        className={cn(isDragging && "opacity-60")}
      >
      <CollapsibleSection
        title={sprint.name}
        extra={typeSummary}
        collapsed={isCollapsed}
        onToggle={() => setCollapsed((c) => ({ ...c, [sprint.id]: !isCollapsed }))}
        actions={
          <>
            {reorderable ? (
              <button
                type="button"
                aria-label={`Reorder ${sprint.name}`}
                title="Drag to reorder"
                className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="size-4" />
              </button>
            ) : null}
            {!isUnstartedSprint(sprint.status) ? (
            <SprintStatusControl
              status={sprint.status}
              endDate={sprint.endDate}
              disabled={pending || !canManage || !isProjectActive || (sprint.status !== "ACTIVE" && Boolean(activeSprint))}
            />
            ) : null}
            {(canCreateSprintPlanning || canStartSprint) && isProjectActive ? (
              <button
                type="button"
                aria-label={`Create sprint planning note for ${sprint.name}`}
                title="Sprint planning note"
                onClick={() => setSprintDoc({ sprint, noteType: "SPRINT_PLANNING" })}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Play className="size-4" />
              </button>
            ) : null}
            {canEndSprint && isProjectActive && !isUnstartedSprint(sprint.status) ? (
              <button
                type="button"
                aria-label={`Open sprint review for ${sprint.name}`}
                title="Sprint review"
                onClick={() => setSprintDoc({ sprint, noteType: "SPRINT_REVIEW" })}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ClipboardCheck className="size-4" />
              </button>
            ) : null}
            {(canCreateSprintPlanning || canDeleteSprint) && isProjectActive ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Sprint options"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {canCreateSprintPlanning ? (
                    <DropdownMenuItem onClick={() => openEdit(sprint)}>
                      Edit sprint
                    </DropdownMenuItem>
                  ) : null}
                  {canDeleteSprint ? (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeletingSprint(sprint)}>
                      Delete sprint
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      >
        <DropList
          id={sprintZoneId(sprint.id)}
          taskIds={items.map((t) => t.id)}
          empty="There's nothing in this sprint."
          dragging={Boolean(activeTask)}
          dropZone
        >
          {items.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              projectId={projectId}
              disabled={!canDrag}
            />
          ))}
        </DropList>
      </CollapsibleSection>
      </div>
    );
  }

  return (
    <>
    {canCreateSprintPlanning && isProjectActive && (
      <PageHeaderActions>
        <AddButton
          className="size-7 rounded-md"
          label="Create sprint"
          onClick={handleCreate}
          busy={pending}
        />
      </PageHeaderActions>
    )}
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-8">
        {!isProjectActive && (
          <div className="rounded-lg border border-orange/30 bg-orange/10 px-4 py-3">
            <p className="text-s font-medium text-orange">
              No active contract — this project is read-only. Add a new contract to re-enable editing.
            </p>
          </div>
        )}

        {error && <p className="text-s text-destructive">{error}</p>}

        {notice && (
          <MissingDataNotice message={notice} onClose={() => setNotice(null)} />
        )}

        {activeSprint && <SprintBlock sprint={activeSprint} />}

        {plannedSprints.length > 0 ? (
          <CollapsibleSection
            title="Planned"
            count={plannedSprints.length}
            collapsed={collapsed[PLANNED_GROUP] ?? false}
            onToggle={() =>
              setCollapsed((c) => ({
                ...c,
                [PLANNED_GROUP]: !(c[PLANNED_GROUP] ?? false),
              }))
            }
          >
            <SortableContext
              items={plannedSprints.map((s) => sprintBlockId(s.id))}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-3">
                {plannedSprints.map((sprint) => (
                  <SprintBlock
                    key={sprint.id}
                    sprint={sprint}
                    reorderable={canDrag && canCreateSprintPlanning}
                  />
                ))}
              </div>
            </SortableContext>
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Backlog"
          count={completedUnassigned.length}
          collapsed={collapsed[BACKLOG_ZONE] ?? false}
          onToggle={() =>
            setCollapsed((c) => ({ ...c, [BACKLOG_ZONE]: !(c[BACKLOG_ZONE] ?? false) }))
          }
          actions={
              canCreateTask && isProjectActive ? (
                <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/projects/${projectId}/tasks/new`)} className="h-7 w-7 p-0" title="New task">
                  <Plus className="h-4 w-4" />
                </Button>
              ) : null
            }
        >
            <DropList
              id={BACKLOG_ZONE}
              taskIds={completedUnassigned.map((t) => t.id)}
              empty="Your backlog is empty."
              dragging={Boolean(activeTask)}
            >
              {completedUnassigned.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  disabled={!canDrag}
                />
              ))}
            </DropList>
        </CollapsibleSection>

        <CollapsibleSection
          title="Missing Data"
          count={missingUnassigned.length}
          collapsed={collapsed[MISSING_ZONE] ?? false}
          onToggle={() =>
            setCollapsed((c) => ({ ...c, [MISSING_ZONE]: !(c[MISSING_ZONE] ?? false) }))
          }
        >
            <DropList
              id={MISSING_ZONE}
              taskIds={missingUnassigned.map((t) => t.id)}
              empty="No tasks with missing data."
              dragging={Boolean(activeTask)}
            >
              {missingUnassigned.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  disabled={!canDrag}
                />
              ))}
            </DropList>
        </CollapsibleSection>
      </div>

      <DragOverlay>
        {activeTask ? (
          <SprintTaskRow
            task={activeTask}
            extra={null}
            className="border-primary/40 bg-card shadow-xl"
          />
        ) : null}
      </DragOverlay>
    </DndContext>

    <EditSprintDialog
      sprint={editing}
      open={editing != null}
      onOpenChange={(open) => {
        if (!open) setEditing(null);
      }}
      onSaved={(saved) => {
        setSprints((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
        setEditing(null);
        router.refresh();
      }}
    />
    <AddToActiveSprintDialog
      key={addToActive?.task.id ?? "idle"}
      open={addToActive != null}
      projectId={projectId}
      sprintName={addToActive?.sprint.name ?? ""}
      task={addToActive?.task ?? null}
      pending={pending}
      onOpenChange={(open) => {
        if (!open) setAddToActive(null);
      }}
      onConfirm={(estimatedMinutes) => {
        if (!addToActive) return;
        const pendingAdd = addToActive;
        setAddToActive(null);
        assignToZone(pendingAdd.task, pendingAdd.zone, estimatedMinutes);
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
        description="This cannot be undone. Tasks in this sprint will return to the Backlog."
        confirmWord={deletingSprint.name}
        confirmLabel="Delete sprint"
        onConfirm={confirmDelete}
      />
    ) : null}
    {sprintDoc ? (
      <NoteSlideOver
        title={`${sprintDoc.sprint.name} ${sprintDoc.noteType === "SPRINT_REVIEW" ? "review" : "planning"}`}
        onClose={closeSprintDoc}
      >
        <NoteFullScreenCreate
          projectId={projectId}
          createTypes={[sprintDoc.noteType]}
          initialTitle={`${sprintDoc.sprint.name} ${sprintDoc.noteType === "SPRINT_REVIEW" ? "review" : "planning"}`}
          sprintId={sprintDoc.sprint.id}
          sprintStatus={sprintDoc.sprint.status}
          isAdmin={isAdmin}
          canStartSprint={canStartSprint}
          canEndSprint={canEndSprint}
          canEditSprintDoc={
            sprintDoc.noteType === "SPRINT_REVIEW" ? canEndSprint : canCreateSprintPlanning
          }
          onCancel={closeSprintDoc}
          saveInHeader={false}
          onCreated={(note) => {
            onNoteCreated?.(note);
          }}
        />
      </NoteSlideOver>
    ) : null}
    </>
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
