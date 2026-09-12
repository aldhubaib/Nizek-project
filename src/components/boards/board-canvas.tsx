"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { positionForIndex } from "@/lib/board-order";
import { createBoardCard, moveBoardCard } from "@/actions/board-card";
import { cardMatchesFilter, isFilterActive, type BoardFilter } from "@/lib/board-filter";
import { BoardColumn } from "./board-column";
import { BoardCard } from "./board-card";
import type {
  BoardCardDTO,
  BoardCardTypeDTO,
  BoardColumnDTO,
  BoardLabelDTO,
} from "@/actions/board";
import type { BoardPermissions } from "@/lib/board-permissions";

const BOARD_ROW =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-2 lg:flex-row lg:items-stretch lg:overflow-x-auto lg:overflow-y-hidden lg:overscroll-x-contain";

interface Props {
  boardId: string;
  columns: BoardColumnDTO[];
  cardTypes: BoardCardTypeDTO[];
  labels: BoardLabelDTO[];
  cards: BoardCardDTO[];
  permissions: BoardPermissions;
  filter: BoardFilter;
  onOpenCard: (cardId: string) => void;
  onError: (message: string) => void;
  /** Pulls the board again after a change the client cannot compute itself. */
  onReload: () => void;
}

export function BoardCanvas({
  boardId,
  columns,
  cardTypes,
  labels,
  cards: initialCards,
  permissions,
  filter,
  onOpenCard,
  onError,
  onReload,
}: Props) {
  const [cards, setCards] = useState(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef(initialCards);
  const dragging = useRef(false);

  // Server data wins, except mid-drag, when the local order is the one the
  // person is actually looking at.
  useEffect(() => {
    if (dragging.current) return;
    setCards(initialCards);
    snapshot.current = initialCards;
  }, [initialCards]);

  const columnIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // A pointer inside a column wins over a merely-close card, so dropping into
  // the blank space below a list lands in that list rather than the neighbour.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const hits = pointerWithin(args);
      const cardHit = hits.find((hit) => !columnIds.has(String(hit.id)));
      if (cardHit) return [cardHit];
      const columnHit = hits.find((hit) => columnIds.has(String(hit.id)));
      if (columnHit) return [columnHit];
      return closestCorners(args);
    },
    [columnIds],
  );

  // Two maps, deliberately. Every card in a column decides where a drop lands,
  // because the server orders against the whole column and an index counted
  // among only the visible cards would file a card in the wrong place. The
  // filtered map is for drawing and nothing else.
  const cardsByColumn = useMemo(() => {
    const map = new Map<string, BoardCardDTO[]>();
    for (const column of columns) map.set(column.id, []);
    for (const card of cards) {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [cards, columns]);

  const filtering = isFilterActive(filter);

  const visibleByColumn = useMemo(() => {
    if (!filtering) return cardsByColumn;
    const now = Date.now();
    const map = new Map<string, BoardCardDTO[]>();
    for (const [columnId, list] of cardsByColumn) {
      map.set(
        columnId,
        list.filter((card) => cardMatchesFilter(card, filter, now)),
      );
    }
    return map;
  }, [cardsByColumn, filter, filtering]);

  const activeCard = activeId ? cards.find((card) => card.id === activeId) : null;

  const typeById = useMemo(
    () => new Map(cardTypes.map((type) => [type.id, type])),
    [cardTypes],
  );

  // Cards carry label ids only, so the board's one copy of each label is
  // resolved here rather than repeated on every card that wears it.
  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels],
  );
  const labelsFor = useCallback(
    (card: BoardCardDTO) =>
      card.labelIds
        .map((id) => labelById.get(id))
        .filter((label): label is BoardLabelDTO => Boolean(label)),
    [labelById],
  );

  function handleDragStart(event: DragStartEvent) {
    dragging.current = true;
    snapshot.current = cards;
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    dragging.current = false;
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const overId = String(over.id);
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    // Where it landed: a column drops at the end, a card drops in front of it.
    const targetColumnId = columnIds.has(overId)
      ? overId
      : cards.find((c) => c.id === overId)?.columnId;
    if (!targetColumnId) return;

    const siblings = (cardsByColumn.get(targetColumnId) ?? []).filter(
      (c) => c.id !== cardId,
    );
    const overIndex = columnIds.has(overId)
      ? siblings.length
      : siblings.findIndex((c) => c.id === overId);
    const index = overIndex === -1 ? siblings.length : overIndex;

    // Nothing actually changed — same column, same slot.
    const currentIndex = (cardsByColumn.get(card.columnId) ?? []).findIndex(
      (c) => c.id === cardId,
    );
    if (card.columnId === targetColumnId && currentIndex === index) return;

    const position = positionForIndex(
      siblings.map((c) => c.position),
      index,
    );

    const before = cards;
    setCards((current) =>
      current.map((c) =>
        c.id === cardId ? { ...c, columnId: targetColumnId, position } : c,
      ),
    );

    const result = await moveBoardCard({ cardId, columnId: targetColumnId, index });
    if (!result.success) {
      setCards(before);
      onError(result.error);
      return;
    }
    // A move can trigger a server-side respacing that rewrites the column's
    // other positions, which the optimistic update above cannot know about.
    onReload();
  }

  const handleCreateCard = useCallback(
    async (input: { columnId: string; cardTypeId: string; title: string }) => {
      const result = await createBoardCard({ boardId, ...input });
      if (!result.success) {
        onError(result.error);
        return;
      }
      onReload();
    },
    [boardId, onError, onReload],
  );

  // Collapsing is only offered as a way to clear the view while filtering, so
  // an unfiltered board never hides an empty column.
  const visibleColumns =
    filtering && filter.collapseEmpty
      ? columns.filter((column) => (visibleByColumn.get(column.id) ?? []).length > 0)
      : columns;

  if (columns.length === 0) {
    return (
      <div className="grid flex-1 place-items-center py-16">
        <p className="text-s text-muted-foreground">
          This board has no columns yet.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        dragging.current = false;
        setActiveId(null);
      }}
    >
      <div className={BOARD_ROW}>
        {visibleColumns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            cards={visibleByColumn.get(column.id) ?? []}
            totalCards={(cardsByColumn.get(column.id) ?? []).length}
            filtering={filtering}
            cardTypes={cardTypes}
            labelsFor={labelsFor}
            canCreateCard={permissions.canCreateCard && cardTypes.length > 0}
            canMoveCard={permissions.canMoveCard}
            onOpenCard={onOpenCard}
            onCreateCard={handleCreateCard}
            isDragActive={activeId !== null}
          />
        ))}
        {visibleColumns.length === 0 && (
          <div className="grid flex-1 place-items-center py-16">
            <p className="text-s text-muted-foreground">
              No cards match this filter.
            </p>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <BoardCard
            card={activeCard}
            cardType={typeById.get(activeCard.cardTypeId)}
            labels={labelsFor(activeCard)}
            isOverlay
            draggable={false}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
