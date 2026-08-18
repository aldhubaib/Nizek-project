"use client";

import { useMemo, useState } from "react";
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
import { CheckCircle2, CheckSquare, Circle, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddButton } from "@/components/add-button";
import { cn } from "@/lib/utils";
import { RoadmapCommitDialog, RoadmapWarningDialog } from "@/components/project/roadmap-commit-dialog";
import {
  ROADMAP_COLUMNS,
  ROADMAP_NEXT_MAX,
  normalizeRoadmapStatus,
  roadmapNextColumnError,
  roadmapScheduleError,
  type RoadmapStatus,
} from "@/lib/roadmap-status";
import { addWorkingDays, formatWorkingDays, startOfLocalDay } from "@/lib/working-days";

export interface RoadmapNote {
  id: string;
  title: string;
  content: string;
  dueDate?: Date | string | null;
  startedAt?: Date | string | null;
  workingDays?: number | null;
  completedAt?: Date | string | null;
  roadmapStatus?: string | null;
  createdAt: Date | string;
  author: { name: string | null; imageUrl: string | null };
  task?: { id: string; stage?: string } | null;
  taskLinks?: { task: { id: string; stage?: string } }[];
  commentThreads?: {
    subscribers?: { userId: string; understoodAt: Date | string | null }[];
  }[];
}

function noteBodyPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getDeadlineStatus(dueDate: Date | string, completedAt: Date | string | null) {
  if (completedAt) return { label: "Completed", color: "text-success", bg: "bg-success/10 border-success/20" };
  const now = new Date();
  const due = new Date(dueDate);
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" };
  if (days === 0) return { label: "Due today", color: "text-orange", bg: "bg-orange/10 border-orange/20" };
  if (days === 1) return { label: "Due tomorrow", color: "text-orange", bg: "bg-orange/10 border-orange/20" };
  if (days <= 7) return { label: `${days}d left`, color: "text-orange", bg: "bg-orange/10 border-orange/20" };
  return { label: `${days}d left`, color: "text-muted-foreground", bg: "bg-muted border-border" };
}

function allLinkedTasks(note: RoadmapNote) {
  const map = new Map<string, { id: string; stage?: string }>();
  if (note.task) map.set(note.task.id, note.task);
  for (const link of note.taskLinks ?? []) map.set(link.task.id, link.task);
  return [...map.values()];
}

function NoteCardStatusIcon({
  openCount,
  doneCount,
  icon: Glyph,
  openLabel,
  doneLabel,
  iconClass,
  badgeClass,
}: {
  openCount: number;
  doneCount: number;
  icon: typeof CheckSquare;
  openLabel: string;
  doneLabel: string;
  iconClass: string;
  badgeClass: string;
}) {
  if (openCount <= 0 && doneCount <= 0) return null;
  return (
    <>
      {openCount > 0 && (
        <span
          className={cn(
            "relative grid size-7 place-items-center rounded-full border border-border bg-popover",
            iconClass,
          )}
          title={openLabel}
        >
          <Glyph className="h-3.5 w-3.5" />
          <span
            className={cn(
              "absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-xs font-bold leading-4 text-background",
              badgeClass,
            )}
          >
            {openCount}
          </span>
        </span>
      )}
      {doneCount > 0 && (
        <span
          className="relative grid size-7 place-items-center rounded-full border border-border bg-popover text-muted-foreground/50"
          title={doneLabel}
        >
          <Glyph className="h-3.5 w-3.5" />
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-muted px-1 text-xs font-bold leading-4 text-muted-foreground">
            {doneCount}
          </span>
        </span>
      )}
    </>
  );
}

export function RoadmapBoard({
  notes,
  canEdit,
  currentUserId,
  onOpen,
  onCreate,
  onMove,
  onBlocked,
  onToggleComplete,
}: {
  notes: RoadmapNote[];
  canEdit: boolean;
  currentUserId?: string;
  onOpen: (noteId: string) => void;
  onCreate: (status: RoadmapStatus) => void;
  onMove: (noteId: string, status: RoadmapStatus) => void;
  onBlocked?: (message: string | null) => void;
  onToggleComplete: (noteId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingProgress, setPendingProgress] = useState<{
    noteId: string;
    title: string;
    startDate: Date;
    dueDate: Date;
  } | null>(null);
  const [warning, setWarning] = useState<{
    heading: string;
    message: string;
    notice?: string;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<RoadmapStatus, RoadmapNote[]> = {
      PLANNED: [],
      NEXT: [],
      PROGRESS: [],
      SHIPPED: [],
    };
    for (const note of notes) {
      map[normalizeRoadmapStatus(note.roadmapStatus, note.completedAt)].push(note);
    }
    return map;
  }, [notes]);

  const activeNote = activeId ? notes.find((n) => n.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over?.id;
    if (!overId) return;
    const status = String(overId) as RoadmapStatus;
    if (!ROADMAP_COLUMNS.some((c) => c.id === status)) return;
    const noteId = String(event.active.id);
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const current = normalizeRoadmapStatus(note.roadmapStatus, note.completedAt);
    if (current === status) return;
    onBlocked?.(null);
    setWarning(null);
    if (status === "NEXT") {
      const nextFull = roadmapNextColumnError(grouped.NEXT.length);
      if (nextFull) {
        setWarning({
          heading: "Next is full",
          message: nextFull,
          notice: "Drag an item back to Planned to free a slot.",
        });
        return;
      }
    }
    if (status === "PROGRESS" && current !== "PROGRESS") {
      const efforts = note.workingDays;
      if (efforts == null || !Number.isInteger(efforts) || efforts < 1) {
        setWarning({
          heading: "Efforts required",
          message: "Please enter the Efforts before moving to In Progress.",
          notice: "Open the item in Next and fill Efforts first.",
        });
        return;
      }
      const startDate = startOfLocalDay();
      setPendingProgress({
        noteId,
        title: note.title,
        startDate,
        dueDate: addWorkingDays(startDate, efforts),
      });
      return;
    }
    const blocked = roadmapScheduleError(status, note.dueDate, note.workingDays);
    if (blocked) {
      setWarning({
        heading: "Cannot move item",
        message: blocked,
      });
      return;
    }
    onMove(noteId, status);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex w-full min-w-0 flex-col gap-l pb-l lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-m lg:overflow-x-auto">
        {ROADMAP_COLUMNS.map((column) => (
          <RoadmapColumn
            key={column.id}
            status={column.id}
            label={column.label}
            notes={grouped[column.id]}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onOpen={onOpen}
            onCreate={onCreate}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNote ? (
          <RoadmapCard
            note={activeNote}
            overlay
            currentUserId={currentUserId}
          />
        ) : null}
      </DragOverlay>
      {pendingProgress ? (
        <RoadmapCommitDialog
          title={pendingProgress.title}
          startDateLabel={format(pendingProgress.startDate, "MMMM d, yyyy")}
          dueDateLabel={format(pendingProgress.dueDate, "MMMM d, yyyy")}
          onCancel={() => setPendingProgress(null)}
          onConfirm={() => {
            const { noteId } = pendingProgress;
            setPendingProgress(null);
            onMove(noteId, "PROGRESS");
          }}
        />
      ) : null}
      {warning ? (
        <RoadmapWarningDialog
          heading={warning.heading}
          message={warning.message}
          notice={warning.notice}
          onDismiss={() => setWarning(null)}
        />
      ) : null}
    </DndContext>
  );
}

function RoadmapColumn({
  status,
  label,
  notes,
  canEdit,
  currentUserId,
  onOpen,
  onCreate,
  onToggleComplete,
}: {
  status: RoadmapStatus;
  label: string;
  notes: RoadmapNote[];
  canEdit: boolean;
  currentUserId?: string;
  onOpen: (noteId: string) => void;
  onCreate: (status: RoadmapStatus) => void;
  onToggleComplete: (noteId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full max-h-[70dvh] flex-col rounded-xl bg-muted/25 lg:h-full lg:max-h-none lg:min-w-[16rem] lg:flex-1",
        isOver && "bg-muted/50 ring-1 ring-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-s font-semibold tracking-tight">{label}</h3>
          <span className="text-s text-muted-foreground tabular-nums">
            {status === "NEXT" ? `${notes.length}/${ROADMAP_NEXT_MAX}` : notes.length}
          </span>
        </div>
        {canEdit && status === "PLANNED" && (
          <AddButton
            label={`Add to ${label}`}
            onClick={() => onCreate(status)}
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-s overflow-y-auto px-2 pb-3">
        {notes.map((note) => (
          <RoadmapCard
            key={note.id}
            note={note}
            canDrag={canEdit}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onOpen={onOpen}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
    </div>
  );
}

function RoadmapCard({
  note,
  canDrag = false,
  canEdit = false,
  currentUserId,
  onOpen,
  onToggleComplete,
  overlay = false,
}: {
  note: RoadmapNote;
  canDrag?: boolean;
  canEdit?: boolean;
  currentUserId?: string;
  onOpen?: (noteId: string) => void;
  onToggleComplete?: (noteId: string) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: note.id,
    disabled: !canDrag || overlay,
  });
  const deadlineStatus = note.dueDate
    ? getDeadlineStatus(note.dueDate, note.completedAt ?? null)
    : null;
  const linked = allLinkedTasks(note);
  const tasksDoneCount = linked.filter((t) => t.stage === "DONE").length;
  const tasksOpenCount = linked.length - tasksDoneCount;
  const commentThreads = note.commentThreads ?? [];
  const commentsDoneCount = commentThreads.filter((t) =>
    currentUserId
      ? t.subscribers?.some((s) => s.userId === currentUserId && s.understoodAt)
      : false,
  ).length;
  const commentsOpenCount = commentThreads.length - commentsDoneCount;
  const authorInitial = (note.author.name ?? "?").charAt(0).toUpperCase();
  const bodyPreview = noteBodyPreview(note.content);

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(note.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(note.id);
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border",
        note.completedAt && "opacity-60",
        canDrag && "cursor-grab active:cursor-grabbing",
        (isDragging || overlay) && "opacity-80 shadow-lg",
        overlay && "w-[15.75rem] cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("min-w-0 text-s font-bold leading-snug line-clamp-2", note.completedAt && "line-through")}>
          {note.title}
        </h3>
        {canEdit && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete?.(note.id);
            }}
            className="shrink-0"
            title={note.completedAt ? "Mark incomplete" : "Mark complete"}
          >
            {note.completedAt ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/40 hover:text-primary transition-colors" />
            )}
          </button>
        )}
      </div>

      {(deadlineStatus || note.workingDays != null) && (
        <span className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${deadlineStatus?.bg ?? "bg-muted border-border"} ${deadlineStatus?.color ?? "text-muted-foreground"}`}>
          {[
            deadlineStatus?.label,
            note.dueDate ? format(new Date(note.dueDate), "MMM d, yyyy") : null,
            note.startedAt ? `Started ${format(new Date(note.startedAt), "MMM d")}` : null,
            note.workingDays != null ? formatWorkingDays(note.workingDays) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}

      {bodyPreview ? (
        <p className="mt-2 line-clamp-2 text-s leading-relaxed text-muted-foreground">
          {bodyPreview}
        </p>
      ) : null}

      <div className="mt-3 shrink-0">
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(note.createdAt), "MMM d, yyyy")}
        </p>
        <div className="mt-2 flex items-center gap-2 text-s">
          <NoteCardStatusIcon
            openCount={tasksOpenCount}
            doneCount={tasksDoneCount}
            icon={CheckSquare}
            openLabel={`${tasksOpenCount} open ${tasksOpenCount === 1 ? "task" : "tasks"}`}
            doneLabel={`${tasksDoneCount} ${tasksDoneCount === 1 ? "task" : "tasks"} done`}
            iconClass="text-success"
            badgeClass="bg-success"
          />
          <NoteCardStatusIcon
            openCount={commentsOpenCount}
            doneCount={commentsDoneCount}
            icon={MessageSquare}
            openLabel={`${commentsOpenCount} open ${commentsOpenCount === 1 ? "comment" : "comments"}`}
            doneLabel={`${commentsDoneCount} ${commentsDoneCount === 1 ? "comment" : "comments"} understood`}
            iconClass="text-orange"
            badgeClass="bg-orange"
          />
          <Avatar
            size="sm"
            className="ms-auto"
            title={note.author.name ?? "Unknown"}
          >
            <AvatarImage src={note.author.imageUrl ?? undefined} alt="" />
            <AvatarFallback>{authorInitial}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
