"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
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
import { MoreHorizontal, Search } from "lucide-react";
import { RoadmapTaskRow } from "@/components/project/sprint-task-row";
import {
  deleteSprint,
  getSprintSnapshots,
  reorderPlannedSprints,
  setSprintBoardStatus,
  startSprint,
  type SprintDTO,
  type SprintSnapshotTask,
} from "@/actions/sprint";
import { CollapsibleSection } from "@/components/project/collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/equity/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import {
  SPRINT_BOARD_COLUMNS,
  compareClosedSprints,
  comparePlannedSprints,
  isClosedSprint,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { cn } from "@/lib/utils";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";

const COLUMN_IDS = new Set<string>(SPRINT_BOARD_COLUMNS.map((c) => c.id));

const COLUMN_COLOR: Record<SprintBoardColumn, string> = {
  PLANNED: "bg-muted-foreground",
  NEXT: "bg-cyan",
  ACTIVE: "bg-sky",
  COMPLETED: "bg-orange",
  SHIPPED: "bg-success",
};

const sprintFirstThenColumn: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const sprintHit = pointerHits.find((hit) => String(hit.id).startsWith("sprint:"));
  if (sprintHit) return [sprintHit];
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
  isProjectActive: boolean;
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
  isProjectActive,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<SprintDTO | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<Record<string, SprintSnapshotTask[]> | null>(null);
  const storeTasks = useKanbanStore((s) => s.tasks);
  const storeProjectId = useKanbanStore((s) => s.projectId);
  const updateTask = useKanbanStore((s) => s.updateTask);
  const liveTasks = storeProjectId === projectId && storeTasks.length > 0 ? storeTasks : initialTasks;
  const [reviewSprint, setReviewSprint] = useState<SprintDTO | null>(null);
  const [planningSprint, setPlanningSprint] = useState<SprintDTO | null>(null);
  const [openTask, setOpenTask] = useState<{ id: string; title: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canDrag = canManage && isProjectActive;
  const activeSprint = useMemo(() => {
    if (!activeId?.startsWith("sprint:")) return null;
    return sprints.find((s) => s.id === activeId.slice("sprint:".length)) ?? null;
  }, [activeId, sprints]);

  const closeReview = useCallback(() => {
    setReviewSprint(null);
    router.refresh();
  }, [router]);

  const closePlanning = useCallback(() => {
    setPlanningSprint(null);
    router.refresh();
  }, [router]);

  const closedCount = sprints.filter((s) => isClosedSprint(s.status)).length;

  useEffect(() => {
    if (closedCount > 0 && snapshots === null) {
      getSprintSnapshots(projectId).then(setSnapshots);
    }
  }, [closedCount, projectId, snapshots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sprints;
    return sprints.filter(
      (sprint) =>
        sprint.name.toLowerCase().includes(q) ||
        (sprint.incompleteReason ?? "").toLowerCase().includes(q),
    );
  }, [sprints, query]);

  const byColumn = useMemo(() => {
    const groups: Record<SprintBoardColumn, SprintDTO[]> = {
      PLANNED: [],
      NEXT: [],
      ACTIVE: [],
      COMPLETED: [],
      SHIPPED: [],
    };
    for (const sprint of filtered) {
      groups[sprintBoardColumn(sprint.status)].push(sprint);
    }
    groups.PLANNED.sort(comparePlannedSprints);
    groups.COMPLETED.sort(compareClosedSprints);
    groups.SHIPPED.sort(compareClosedSprints);
    return groups;
  }, [filtered]);

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !canDrag) return;
    const sprintId = sprintIdFromDrag(String(active.id));
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

      if (column === "COMPLETED" && sprint.status === "ACTIVE") {
        setError("Complete the sprint from the review or backlog first.");
        return;
      }

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
    }, 0);
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

  if (sprints.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-s text-muted-foreground">No sprints yet</p>
        <p className="text-xs text-muted-foreground">
          Create a sprint from the Backlog to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sprints"
          className="pl-8"
          aria-label="Search sprints"
        />
      </div>

      {error ? <p className="text-s text-destructive">{error}</p> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={sprintFirstThenColumn}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {SPRINT_BOARD_COLUMNS.map((column) => {
            const cards = byColumn[column.id].map((sprint) => {
              const items = tasksForSprint(sprint.id);
              const isCollapsed = collapsed[sprint.id] ?? true;
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
                  onPlan={() => setPlanningSprint(sprint)}
                  onReview={() => setReviewSprint(sprint)}
                  onDelete={() => setDeletingSprint(sprint)}
                  onOpenTask={(task) =>
                    setOpenTask({ id: task.taskId, title: task.title })
                  }
                />
              );
            });
            return (
            <SprintColumn
              key={column.id}
              column={column}
              sprints={byColumn[column.id]}
              emptyLabel={
                query.trim()
                  ? `No sprints match "${query.trim()}".`
                  : column.id === "NEXT"
                    ? "Drop one sprint here."
                    : "Drop a sprint here."
              }
              dropBlocked={
                column.id === "NEXT" &&
                Boolean(
                  activeSprint &&
                    sprintBoardColumn(activeSprint.status) !== "NEXT" &&
                    byColumn.NEXT.some((s) => s.id !== activeSprint.id),
                )
              }
            >
              {column.id === "PLANNED" ? (
                <SortableContext
                  items={byColumn.PLANNED.map((s) => sprintDragId(s.id))}
                  strategy={verticalListSortingStrategy}
                >
                  {cards}
                </SortableContext>
              ) : (
                cards
              )}
            </SprintColumn>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeSprint ? (
            <div className="rounded-lg border border-border/50 bg-card px-3 py-4 text-s font-semibold shadow-lg">
              {activeSprint.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
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
    {openTask ? (
      <TaskInboxSlideOver
        taskId={openTask.id}
        title={openTask.title}
        onClose={() => setOpenTask(null)}
      />
    ) : null}
    {reviewSprint ? (
      <NoteSlideOver
        title={`${reviewSprint.name} review`}
        onClose={closeReview}
      >
        <NoteFullScreenCreate
          projectId={projectId}
          createTypes={["SPRINT_REVIEW"]}
          initialTitle={`${reviewSprint.name} review`}
          sprintId={reviewSprint.id}
          onCancel={closeReview}
          saveInHeader={false}
          onCreated={() => {}}
        />
      </NoteSlideOver>
    ) : null}
    {planningSprint ? (
      <NoteSlideOver
        title={`${planningSprint.name} planning`}
        onClose={closePlanning}
      >
        <NoteFullScreenCreate
          projectId={projectId}
          createTypes={["SPRINT_PLANNING"]}
          initialTitle={`${planningSprint.name} planning`}
          sprintId={planningSprint.id}
          sprintStatus={planningSprint.status}
          onCancel={closePlanning}
          saveInHeader={false}
          onCreated={() => {}}
        />
      </NoteSlideOver>
    ) : null}
    </div>
  );
}

function SprintColumn({
  column,
  sprints,
  emptyLabel,
  dropBlocked,
  children,
}: {
  column: (typeof SPRINT_BOARD_COLUMNS)[number];
  sprints: SprintDTO[];
  emptyLabel: string;
  dropBlocked?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[min(100%,18rem)] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/30 lg:min-h-0 lg:flex-1 lg:basis-0",
        isOver && !dropBlocked && "border-success/60 bg-success/5",
        isOver && dropBlocked && "border-destructive/50 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <div className={cn("h-2.5 w-2.5 rounded-full", COLUMN_COLOR[column.id])} />
        <h3 className="text-s font-medium">{column.label}</h3>
        <span className="text-s text-muted-foreground">{sprints.length}</span>
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
  onToggle,
  onPlan,
  onReview,
  onDelete,
  onOpenTask,
}: {
  sprint: SprintDTO;
  items: SprintSnapshotTask[];
  collapsed: boolean;
  canDrag: boolean;
  canManage: boolean;
  isProjectActive: boolean;
  onToggle: () => void;
  onPlan: () => void;
  onReview: () => void;
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
        title={sprint.name}
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
              <DropdownMenuItem onClick={onPlan}>
                Sprint planning
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onReview}>
                Sprint review
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
          <div className="space-y-3">
            {items.map((task) => (
              <div key={task.id} className="space-y-1.5">
                <RoadmapTaskRow
                  task={task}
                  missingData={false}
                  onClick={() => onOpenTask(task)}
                />
                {task.incompleteReason ? (
                  <p className="rounded-lg border border-border/60 bg-surface/60 px-3 py-2 text-s leading-relaxed text-muted-foreground">
                    <span className="mb-0.5 block text-xs font-medium uppercase tracking-wider">
                      Incomplete because
                    </span>
                    <span className="text-foreground">{task.incompleteReason}</span>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
