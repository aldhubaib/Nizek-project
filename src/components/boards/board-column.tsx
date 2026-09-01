"use client";

import { memo, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import { BoardCard } from "./board-card";
import { BoardIcon } from "./board-icon";
import type { BoardCardDTO, BoardCardTypeDTO, BoardColumnDTO } from "@/actions/board";

interface Props {
  column: BoardColumnDTO;
  cards: BoardCardDTO[];
  cardTypes: BoardCardTypeDTO[];
  canCreateCard: boolean;
  canMoveCard: boolean;
  onOpenCard: (cardId: string) => void;
  onCreateCard: (input: { columnId: string; cardTypeId: string; title: string }) => Promise<void>;
  /** Highlighted while a card is in flight. Every column is a valid target. */
  isDragActive: boolean;
}

export const BoardColumn = memo(function BoardColumn({
  column,
  cards,
  cardTypes,
  canCreateCard,
  canMoveCard,
  onOpenCard,
  onCreateCard,
  isDragActive,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const palette = boardColor(column.color);
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState(cardTypes[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const typeById = useMemo(
    () => new Map(cardTypes.map((type) => [type.id, type])),
    [cardTypes],
  );

  function openComposer() {
    setTypeId(cardTypes[0]?.id ?? "");
    setTitle("");
    setComposing(true);
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || !typeId || saving) return;
    setSaving(true);
    await onCreateCard({ columnId: column.id, cardTypeId: typeId, title: trimmed });
    setSaving(false);
    // Stays open so several cards can be added in a row, the way a board of
    // this kind is normally filled.
    setTitle("");
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full max-h-[70dvh] shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-colors lg:h-full lg:max-h-none lg:min-h-0 lg:w-[320px] lg:self-stretch",
        // Every column accepts every card, so there is no invalid-target state
        // to draw here — unlike the sprint board, where the next stage is the
        // only place a card may go.
        isOver && isDragActive && "border-primary/60 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("size-2.5 shrink-0 rounded-full", palette.dot)} />
          <h3 className="truncate text-s font-medium">{column.name}</h3>
          <span className="shrink-0 text-s text-muted-foreground">{cards.length}</span>
        </div>
        {canCreateCard && !composing && (
          <button
            type="button"
            onClick={openComposer}
            aria-label={`Add a card to ${column.name}`}
            title="Add a card"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain p-2">
        {composing && (
          <div className="mb-2 rounded-md border border-border bg-field p-2">
            <textarea
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
                if (event.key === "Escape") setComposing(false);
              }}
              placeholder="What needs doing?"
              rows={2}
              className="w-full resize-none bg-transparent text-s leading-relaxed outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-2 flex items-center gap-2">
              {cardTypes.length > 1 && (
                <select
                  value={typeId}
                  onChange={(event) => setTypeId(event.target.value)}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none"
                >
                  {cardTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              )}
              {cardTypes.length === 1 && typeById.get(typeId) && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BoardIcon name={typeById.get(typeId)?.icon} className="size-3.5" />
                  {typeById.get(typeId)?.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!title.trim() || saving}
                className="ms-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="size-3 animate-spin" />}
                Add
              </button>
              <button
                type="button"
                onClick={() => setComposing(false)}
                aria-label="Cancel"
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {cards.map((card) => (
              <BoardCard
                key={card.id}
                card={card}
                cardType={typeById.get(card.cardTypeId)}
                onOpen={onOpenCard}
                draggable={canMoveCard}
              />
            ))}
          </div>
        </SortableContext>

        {cards.length === 0 && !composing && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-s text-muted-foreground/60">No cards</p>
          </div>
        )}
      </div>
    </div>
  );
});
