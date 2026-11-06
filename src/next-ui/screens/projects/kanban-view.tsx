"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowRight, Pencil, Plus, SquareKanban, Trash2 } from "lucide-react";

import { BOARD_COLORS } from "@/lib/board-palette";
import { RecordMenu } from "@/next-ui/blocks";
import { useBoard, useCreateCard, useDeleteCard, useMoveCard, useUpdateCard } from "@/next-ui/data/kanban";
import { cardsOf, dropTarget, type KanbanBoard, type KanbanCard, type KanbanColumn } from "@/next-ui/data/kanban-logic";
import { cn } from "@/next-ui/lib/cn";
import { hrefFromEntry, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Textarea } from "@/next-ui/ui/textarea";

import { Lane, LaneBoard, LaneSkeleton } from "./lanes";

/**
 * The project's Kanban: its columns — To do, In progress, Completed — and the tasks on them,
 * each a title and a description and nothing more. A task is added from the header or from a
 * column, opened to be edited, moved by dragging it to another column (or from its menu, which
 * also works by keyboard and touch), and deleted. What the viewer may do comes with the board.
 * `on` is the project's own word on whether its Kanban is switched on: with it on and no board
 * to show, the viewer is one who may not see it (a client account).
 */
export function KanbanView({ projectId, on = false, canEditSettings = false }: { projectId: string; on?: boolean; canEditSettings?: boolean }) {
  const board = useBoard(projectId);
  const pane = usePane();
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<CardDialogState>(null);

  if (board.isPending) {
    return (
      <LaneBoard className="animate-pulse">
        <LaneSkeleton rows={3} />
        <LaneSkeleton rows={2} />
        <LaneSkeleton rows={1} />
      </LaneBoard>
    );
  }
  if (board.error) {
    return <EmptyState icon={SquareKanban} title="Could not open the Kanban" description={board.error instanceof Error ? board.error.message : String(board.error)} />;
  }
  if (!board.data && on) {
    return <EmptyState icon={SquareKanban} title="This Kanban is not open to you" description="It is for the project's team; client accounts do not see it." />;
  }
  if (!board.data) {
    return (
      <EmptyState
        icon={SquareKanban}
        title="Kanban is off"
        description={canEditSettings ? "Switch it on in Settings, under Ways of working." : "A project admin can switch it on in Settings."}
        action={
          canEditSettings ? (
            <Button variant="outline" size="sm" onClick={() => pane.navigate(hrefFromEntry({ kind: "project", id: projectId, view: "settings" }))}>
              Open settings
            </Button>
          ) : undefined
        }
      />
    );
  }

  const b = board.data;
  const can = b.permissions;
  return (
    <>
      <ListTools
        what="tasks"
        search={search}
        onSearch={setSearch}
        placeholder="Search tasks…"
        action={can.canCreateCard && b.columns.length > 0 && <HeaderAction label="New task" icon={<Plus />} onClick={() => setDialog({ kind: "new", columnId: b.columns[0].id })} data-testid="new-task-button" />}
      />
      <Board board={b} projectId={projectId} search={search} onNew={(columnId) => setDialog({ kind: "new", columnId })} onOpen={(card) => setDialog({ kind: "edit", card })} />
      <CardDialog projectId={projectId} board={b} state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

type CardDialogState = { kind: "new"; columnId: string } | { kind: "edit"; card: KanbanCard } | null;

/** Cards first (the pointer is over one), else the column under the pointer, else the nearest. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const card = within.find((c) => String(c.id).startsWith("card:"));
  if (card) return [card];
  if (within.length > 0) return within;
  return rectIntersection(args);
};

function Board({
  board: b,
  projectId,
  search,
  onNew,
  onOpen,
}: {
  board: KanbanBoard;
  projectId: string;
  search: string;
  onNew: (columnId: string) => void;
  onOpen: (card: KanbanCard) => void;
}) {
  const move = useMoveCard(projectId);
  const remove = useDeleteCard(projectId);
  const can = b.permissions;
  const searching = search.trim() !== "";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = activeId ? b.cards.find((c) => c.id === activeId) : undefined;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over?.data.current as { columnId: string; cardId?: string } | undefined;
    const cardId = String(e.active.id).replace(/^card:/, "");
    if (!over) return;
    const target = dropTarget(b, cardId, over);
    if (target) move.mutate({ cardId, ...target });
  };
  const moveToEnd = (card: KanbanCard, columnId: string) => move.mutate({ cardId: card.id, columnId, index: cardsOf(b, columnId).filter((c) => c.id !== card.id).length });

  return (
    <DndContext
      id={`kanban-${b.id}`}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setActiveId(String(e.active.id).replace(/^card:/, ""))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <LaneBoard>
        {b.columns.map((col) => {
          const cards = cardsOf(b, col.id, search);
          return (
            <Column key={col.id} column={col} count={cards.length} canDrop={can.canMoveCard && !searching} onNew={can.canCreateCard ? () => onNew(col.id) : undefined} empty={searching ? "No match" : "Nothing here yet"}>
              {cards.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  column={col}
                  dragging={card.id === activeId}
                  draggable={can.canMoveCard && !searching}
                  onOpen={() => onOpen(card)}
                  menu={
                    (can.canEditCard || can.canMoveCard || can.canDeleteCard) && (
                      <RecordMenu label={`Actions for ${card.title}`} contentClassName="min-w-56">
                        {can.canEditCard && (
                          <DropdownMenuItem onSelect={() => onOpen(card)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {can.canMoveCard &&
                          b.columns
                            .filter((other) => other.id !== col.id)
                            .map((other) => (
                              <DropdownMenuItem key={other.id} onSelect={() => moveToEnd(card, other.id)}>
                                <ArrowRight />
                                Move to {other.name}
                              </DropdownMenuItem>
                            ))}
                        {can.canDeleteCard && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(card.id)}>
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </RecordMenu>
                    )
                  }
                />
              ))}
            </Column>
          );
        })}
      </LaneBoard>
      <DragOverlay dropAnimation={null}>{active ? <CardFace card={active} className="rotate-1 shadow-lg" /> : null}</DragOverlay>
    </DndContext>
  );
}

/** The column's dot, from its palette colour; "green" is the new panel's green, not the live one's. */
function dotClass(column: KanbanColumn): string {
  if (column.color === "green") return "bg-success";
  return BOARD_COLORS.find((c) => c.id === column.color)?.dot ?? "bg-muted-foreground";
}

function Column({
  column,
  count,
  canDrop,
  onNew,
  empty,
  children,
}: {
  column: KanbanColumn;
  count: number;
  canDrop: boolean;
  onNew?: () => void;
  empty: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}`, data: { columnId: column.id }, disabled: !canDrop });
  return (
    <Lane
      title={column.name}
      status=""
      dot={dotClass(column)}
      count={count}
      empty={empty}
      bodyRef={setNodeRef}
      bodyClassName={cn(isOver && "border-ring/60 bg-muted/40")}
      testId="kanban-column"
      action={
        onNew && (
          <Button variant="ghost" size="icon-xs" aria-label={`Add a task to ${column.name}`} className="text-muted-foreground" onClick={onNew} data-testid="column-add">
            <Plus />
          </Button>
        )
      }
    >
      {count > 0 ? children : undefined}
    </Lane>
  );
}

function CardItem({
  card,
  column,
  dragging,
  draggable,
  onOpen,
  menu,
}: {
  card: KanbanCard;
  column: KanbanColumn;
  dragging: boolean;
  draggable: boolean;
  onOpen: () => void;
  menu: React.ReactNode;
}) {
  const drag = useDraggable({ id: `card:${card.id}`, data: { columnId: column.id, cardId: card.id }, disabled: !draggable });
  const drop = useDroppable({ id: `card:${card.id}`, data: { columnId: column.id, cardId: card.id }, disabled: !draggable });
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <CardFace
      ref={ref}
      card={card}
      menu={menu}
      className={cn(dragging && "opacity-40", drop.isOver && !dragging && "ring-2 ring-ring/50")}
      onClick={onOpen}
      {...drag.listeners}
      {...drag.attributes}
      data-testid="kanban-card"
    />
  );
}

/** The card as drawn: its title and the first lines of its description. Also the ghost that follows a drag. */
const CardFace = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { card: KanbanCard; menu?: React.ReactNode }>(function CardFace(
  { card, menu, className, onClick, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-open]")) return;
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if ((e.target as HTMLElement).closest("[data-no-open]")) return;
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      className={cn(
        "group/card flex cursor-pointer flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium break-words">{card.title}</p>
        {menu && (
          // pressing the ⋯ opens its menu and neither starts a drag nor opens the task
          <span className="-my-1 -me-2 shrink-0 opacity-70 group-hover/card:opacity-100 group-focus-within/card:opacity-100" onPointerDown={(e) => e.stopPropagation()} data-no-open>
            {menu}
          </span>
        )}
      </div>
      {card.description && <p className="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">{card.description}</p>}
    </div>
  );
});

/** One dialog for a new task and for an open one: title, description, column; an open task can also be deleted. */
function CardDialog({ projectId, board: b, state, onClose }: { projectId: string; board: KanbanBoard; state: CardDialogState; onClose: () => void }) {
  const create = useCreateCard(projectId);
  const update = useUpdateCard(projectId);
  const move = useMoveCard(projectId);
  const remove = useDeleteCard(projectId);
  const can = b.permissions;
  const card = state?.kind === "edit" ? state.card : null;
  const [draft, setDraft] = React.useState({ title: "", description: "", columnId: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [seeded, setSeeded] = React.useState<CardDialogState>(null);
  // the fields take the task's values when it opens, once per opening; they keep them while it fades out
  if (state !== seeded) {
    setSeeded(state);
    if (state) {
      setDraft(state.kind === "edit" ? { title: state.card.title, description: state.card.description ?? "", columnId: state.card.columnId } : { title: "", description: "", columnId: state.columnId });
      setError(null);
      setConfirmDelete(false);
    }
  }
  const busy = create.isPending || update.isPending || move.isPending || remove.isPending;
  const readOnly = card ? !can.canEditCard : false;
  const title = draft.title.trim();
  const canSave = title !== "" && !busy && !readOnly;
  const fail = (what: string) => (err: unknown) => setError(err instanceof Error ? err.message : what);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    if (!card) {
      const cardType = b.cardTypes[0];
      if (!cardType) return setError("This board has no card type to add a task with.");
      create.mutate({ boardId: b.id, columnId: draft.columnId, cardTypeId: cardType.id, title, description: draft.description }, { onSuccess: onClose, onError: fail("Could not add the task.") });
      return;
    }
    const changes = {
      ...(title !== card.title && { title }),
      ...(draft.description.trim() !== (card.description ?? "") && { description: draft.description.trim() || null }),
    };
    const moved = draft.columnId !== card.columnId;
    const after = () => {
      if (!moved) return onClose();
      move.mutate({ cardId: card.id, columnId: draft.columnId, index: cardsOf(b, draft.columnId).length }, { onSuccess: onClose, onError: fail("Could not move the task.") });
    };
    if (Object.keys(changes).length === 0) return after();
    update.mutate({ cardId: card.id, ...changes }, { onSuccess: after, onError: fail("Could not save the task.") });
  };
  const destroy = () => {
    if (!card) return;
    setError(null);
    remove.mutate(card.id, { onSuccess: onClose, onError: fail("Could not delete the task.") });
  };

  return (
    <Dialog open={state !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="task-dialog">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>{card ? "Task" : "New task"}</DialogTitle>
            <DialogDescription>{card ? "Its title and description, and the column it is in." : "A title, a few words if they help, and the column it starts in."}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required maxLength={200} autoFocus readOnly={readOnly} data-testid="task-title" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea id="task-description" rows={5} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Optional" readOnly={readOnly} data-testid="task-description" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-column">Column</Label>
              <Select value={draft.columnId} onValueChange={(v) => setDraft((d) => ({ ...d, columnId: v }))} disabled={card ? !can.canMoveCard : false}>
                <SelectTrigger id="task-column" className="w-full" data-testid="task-column">
                  <SelectValue placeholder="Choose a column" />
                </SelectTrigger>
                <SelectContent>
                  {b.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {confirmDelete && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="delete-confirm">
                Delete this task? It cannot be undone.
              </p>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <span>
              {card && can.canDeleteCard && (
                <Button type="button" variant={confirmDelete ? "destructive" : "ghost"} className={cn(!confirmDelete && "text-destructive")} disabled={busy} onClick={() => (confirmDelete ? destroy() : setConfirmDelete(true))} data-testid="task-delete">
                  <Trash2 />
                  {confirmDelete ? (remove.isPending ? "Deleting…" : "Yes, delete") : "Delete"}
                </Button>
              )}
            </span>
            <span className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {readOnly ? "Close" : "Cancel"}
                </Button>
              </DialogClose>
              {!readOnly && (
                <Button type="submit" disabled={!canSave} data-testid="task-save">
                  {busy && !remove.isPending ? "Saving…" : card ? "Save" : "Add task"}
                </Button>
              )}
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
