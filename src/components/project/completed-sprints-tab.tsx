"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction, type ReactNode } from "react";
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
import { MoreHorizontal, Search } from "lucide-react";
import { EstimateBadge, SprintTaskRow, TaskTypeCountSummary } from "@/components/project/sprint-task-row";
import {
  deleteSprint,
  getSprintSnapshots,
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
  isClosedSprint,
  sprintBoardColumn,
  type SprintBoardColumn,
} from "@/lib/sprint-status";
import { cn } from "@/lib/utils";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";

const COLUMN_IDS = new Set<string>(SPRINT_BOARD_COLUMNS.map((c) => c.id));

const COLUMN_COLOR: Record<SprintBoardColumn, string> = {
  PLANNED: "bg-muted-foreground",
  NEXT: "bg-cyan",
  ACTIVE: "bg-sky",
  COMPLETED: "bg-orange",
  SHIPPED: "bg-success",
};

const columnFirstCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
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
    const sprintId = String(active.id).startsWith("sprint:")
      ? String(active.id).slice("sprint:".length)
      : "";
    const sprint = sprints.find((s) => s.id === sprintId);
    if (!sprint) return;

    let columnId = String(over.id);
    if (columnId.startsWith("sprint:")) {
      const other = sprints.find((s) => s.id === columnId.slice("sprint:".length));
      if (!other) return;
      columnId = sprintBoardColumn(other.status);
    }
    if (!COLUMN_IDS.has(columnId)) return;
    const column = columnId as SprintBoardColumn;
    if (sprintBoardColumn(sprint.status) === column) return;

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
        collisionDetection={columnFirstCollision}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {SPRINT_BOARD_COLUMNS.map((column) => (
            <SprintColumn
              key={column.id}
              column={column}
              sprints={byColumn[column.id]}
              emptyLabel={
                query.trim()
                  ? `No sprints match "${query.trim()}".`
                  : "Drop a sprint here."
              }
            >
              {byColumn[column.id].map((sprint) => {
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
                    projectId={projectId}
                    onToggle={() =>
                      setCollapsed((c) => ({ ...c, [sprint.id]: !isCollapsed }))
                    }
                    onPlan={() => setPlanningSprint(sprint)}
                    onReview={() => setReviewSprint(sprint)}
                    onDelete={() => setDeletingSprint(sprint)}
                  />
                );
              })}
            </SprintColumn>
          ))}
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
  children,
}: {
  column: (typeof SPRINT_BOARD_COLUMNS)[number];
  sprints: SprintDTO[];
  emptyLabel: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[min(100%,18rem)] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/30 lg:min-h-0 lg:flex-1 lg:basis-0",
        isOver && "border-success/60 bg-success/5",
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
  projectId,
  onToggle,
  onPlan,
  onReview,
  onDelete,
}: {
  sprint: SprintDTO;
  items: SprintSnapshotTask[];
  collapsed: boolean;
  canDrag: boolean;
  canManage: boolean;
  isProjectActive: boolean;
  projectId: string;
  onToggle: () => void;
  onPlan: () => void;
  onReview: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sprintDragId(sprint.id),
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      <CollapsibleSection
        title={sprint.name}
        extra={<TaskTypeCountSummary tasks={items} />}
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
                <SprintTaskRow
                  task={task}
                  missingData={false}
                  extra={
                    task.estimatedMinutes != null && task.estimatedMinutes > 0 ? (
                      <EstimateBadge minutes={task.estimatedMinutes} />
                    ) : null
                  }
                  onClick={() =>
                    router.push(`/dashboard/projects/${projectId}/tasks/${task.taskId}`)
                  }
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
