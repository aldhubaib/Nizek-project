"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import {
  Play,
  Square,
  Plus,
  Trash2,
  X,
  Search,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ROADMAP_COLUMNS, type RoadmapStatus } from "@/lib/roadmap-status";
import { STAGE_LABELS, TASK_TYPE_CONFIG } from "@/types";
import type { Stage, TaskType } from "@/types";

export interface SprintData {
  id: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
  workingDays: number | null;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  dueDate: Date | string | null;
  createdAt: Date | string;
  items: SprintItemData[];
}

export interface SprintItemData {
  id: string;
  status: RoadmapStatus;
  order: number;
  task: {
    id: string;
    taskNumber: number;
    title: string;
    stage: Stage;
    taskType: TaskType;
    priority: number | null;
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
    createdBy: { id: string; name: string | null; imageUrl: string | null };
  };
}

export interface PickerTask {
  id: string;
  taskNumber: number;
  title: string;
  stage: Stage;
  taskType: TaskType;
  priority: number | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
}

interface SprintBoardProps {
  sprint: SprintData;
  canEdit: boolean;
  onMoveItem: (taskId: string, newStatus: RoadmapStatus) => void;
  onRemoveItem: (taskId: string) => void;
  onStartSprint: (workingDays: number) => void;
  onStopSprint: () => void;
  onAddTasks: (taskIds: string[]) => void;
  availableTasks: PickerTask[];
  loadingTasks?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-muted-foreground",
  ACTIVE: "bg-success",
  COMPLETED: "bg-primary",
};

export function SprintBoard({
  sprint,
  canEdit,
  onMoveItem,
  onRemoveItem,
  onStartSprint,
  onStopSprint,
  onAddTasks,
  availableTasks,
  loadingTasks,
}: SprintBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [workingDaysInput, setWorkingDaysInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<RoadmapStatus, SprintItemData[]> = {
      PLANNED: [],
      NEXT: [],
      PROGRESS: [],
      SHIPPED: [],
    };
    for (const item of sprint.items) {
      map[item.status].push(item);
    }
    return map;
  }, [sprint.items]);

  const activeItem = activeId
    ? sprint.items.find((i) => i.task.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!canEdit) return;
    const overId = event.over?.id;
    if (!overId) return;
    const status = String(overId) as RoadmapStatus;
    if (!ROADMAP_COLUMNS.some((c) => c.id === status)) return;
    const taskId = String(event.active.id);
    const item = sprint.items.find((i) => i.task.id === taskId);
    if (!item || item.status === status) return;
    onMoveItem(taskId, status);
  }

  const daysLeft = sprint.dueDate
    ? Math.ceil(
        (new Date(sprint.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <>
      {/* Sprint header */}
      <div className="flex flex-wrap items-center gap-3 px-1 pb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              STATUS_COLORS[sprint.status],
            )}
          />
          <h3 className="text-base font-bold">{sprint.name}</h3>
          <Badge variant="outline" className="text-xs capitalize">
            {sprint.status.toLowerCase()}
          </Badge>
        </div>

        {sprint.status === "ACTIVE" && sprint.dueDate && (
          <span className="text-s text-muted-foreground">
            {daysLeft != null && daysLeft >= 0
              ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`
              : "Overdue"}{" "}
            · Due {format(new Date(sprint.dueDate), "MMM d, yyyy")}
          </span>
        )}

        {sprint.status === "COMPLETED" && sprint.endedAt && (
          <span className="text-s text-muted-foreground">
            Completed {format(new Date(sprint.endedAt), "MMM d, yyyy")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canEdit && sprint.status !== "COMPLETED" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Tasks
            </Button>
          )}
          {canEdit && sprint.status === "PLANNING" && (
            <Button
              size="sm"
              onClick={() => setShowStartDialog(true)}
              disabled={sprint.items.length === 0}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              Start Sprint
            </Button>
          )}
          {canEdit && sprint.status === "ACTIVE" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => startTransition(() => onStopSprint())}
              disabled={isPending}
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop Sprint
            </Button>
          )}
        </div>
      </div>

      {/* Sprint board - 4 columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex w-full min-w-0 flex-col gap-l pb-l lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-m lg:overflow-x-auto">
          {ROADMAP_COLUMNS.map((column) => (
            <SprintColumn
              key={column.id}
              status={column.id}
              label={column.label}
              items={grouped[column.id]}
              canEdit={canEdit}
              onRemoveItem={onRemoveItem}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <SprintTaskCard item={activeItem} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task picker dialog */}
      {showPicker && (
        <TaskPickerDialog
          tasks={availableTasks}
          loading={loadingTasks}
          onAdd={(taskIds) => {
            onAddTasks(taskIds);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Start sprint dialog */}
      {showStartDialog && (
        <Dialog open onOpenChange={() => setShowStartDialog(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Start {sprint.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-s font-medium" htmlFor="working-days">
                  Working Days
                </label>
                <Input
                  id="working-days"
                  type="number"
                  min={1}
                  placeholder="e.g. 10"
                  value={workingDaysInput}
                  onChange={(e) => setWorkingDaysInput(e.target.value)}
                  className="text-s"
                />
                <p className="text-xs text-muted-foreground">
                  The sprint duration in working days (excludes Fri–Sat).
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {sprint.items.length} task{sprint.items.length !== 1 ? "s" : ""} in
                this sprint
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStartDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!workingDaysInput || parseInt(workingDaysInput) < 1}
                  onClick={() => {
                    const days = parseInt(workingDaysInput);
                    if (days >= 1) {
                      startTransition(() => onStartSprint(days));
                      setShowStartDialog(false);
                    }
                  }}
                >
                  Start Sprint
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function SprintColumn({
  status,
  label,
  items,
  canEdit,
  onRemoveItem,
}: {
  status: RoadmapStatus;
  label: string;
  items: SprintItemData[];
  canEdit: boolean;
  onRemoveItem: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full max-h-[70dvh] flex-col rounded-xl bg-muted/25 lg:h-full lg:max-h-none lg:min-w-[14rem] lg:flex-1",
        isOver && "bg-muted/50 ring-1 ring-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-s font-semibold tracking-tight">{label}</h3>
          <span className="text-s text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-s overflow-y-auto px-2 pb-3">
        {items.map((item) => (
          <SprintTaskCard
            key={item.task.id}
            item={item}
            canDrag={canEdit}
            canRemove={canEdit}
            onRemove={() => onRemoveItem(item.task.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SprintTaskCard({
  item,
  canDrag = false,
  canRemove = false,
  onRemove,
  overlay = false,
}: {
  item: SprintItemData;
  canDrag?: boolean;
  canRemove?: boolean;
  onRemove?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: item.task.id,
      disabled: !canDrag || overlay,
    });

  const typeConfig = TASK_TYPE_CONFIG[item.task.taskType];
  const stageLabel = STAGE_LABELS[item.task.stage];
  const assignee = item.task.assignee;
  const assigneeInitial = (assignee?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      className={cn(
        "flex flex-col rounded-2xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border",
        canDrag && "cursor-grab active:cursor-grabbing",
        (isDragging || overlay) && "opacity-80 shadow-lg",
        overlay && "w-[14rem] cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            #{item.task.taskNumber}
          </span>
          <h4 className="text-s font-semibold leading-snug line-clamp-2">
            {item.task.title}
          </h4>
        </div>
        {canRemove && onRemove && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors"
            title="Remove from sprint"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            typeConfig.bg,
            typeConfig.color,
          )}
        >
          {typeConfig.label}
        </span>
        <span className="text-xs text-muted-foreground">{stageLabel}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {assignee ? (
          <Avatar size="sm" title={assignee.name ?? "Unassigned"}>
            <AvatarImage src={assignee.imageUrl ?? undefined} alt="" />
            <AvatarFallback>{assigneeInitial}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function TaskPickerDialog({
  tasks,
  loading,
  onAdd,
  onClose,
}: {
  tasks: PickerTask[];
  loading?: boolean;
  onAdd: (taskIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        String(t.taskNumber).includes(q),
    );
  }, [tasks, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Tasks to Sprint</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-s"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {loading ? (
            <p className="py-8 text-center text-s text-muted-foreground">
              Loading tasks...
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-s text-muted-foreground">
              No tasks available
            </p>
          ) : (
            filtered.map((task) => {
              const isSelected = selected.has(task.id);
              const typeConfig = TASK_TYPE_CONFIG[task.taskType];
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggle(task.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors",
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.5 6l2.5 2.5 4.5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        #{task.taskNumber}
                      </span>
                      <span className="text-s font-medium truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          typeConfig.color,
                        )}
                      >
                        {typeConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {STAGE_LABELS[task.stage]}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-s text-muted-foreground">
            {selected.size} task{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={() => onAdd([...selected])}
            >
              Add to Sprint
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
