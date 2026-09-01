"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleAlert, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import { BoardIcon } from "./board-icon";
import type { BoardCardDTO, BoardCardTypeDTO } from "@/actions/board";

interface Props {
  card: BoardCardDTO;
  cardType: BoardCardTypeDTO | undefined;
  onOpen?: (cardId: string) => void;
  /** Off for a read-only viewer, and for the drag overlay copy. */
  draggable?: boolean;
  isOverlay?: boolean;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export const BoardCard = memo(function BoardCard({
  card,
  cardType,
  onOpen,
  draggable = true,
  isOverlay = false,
}: Props) {
  const sortable = useSortable({ id: card.id, disabled: !draggable });
  const palette = boardColor(cardType?.color);

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      };

  return (
    <div
      ref={isOverlay ? undefined : sortable.setNodeRef}
      style={style}
      {...(isOverlay ? {} : sortable.attributes)}
      {...(isOverlay ? {} : sortable.listeners)}
      onClick={() => onOpen?.(card.id)}
      className={cn(
        "group rounded-md border border-border bg-field px-3 py-2.5 text-start",
        draggable && "cursor-grab active:cursor-grabbing",
        onOpen && "hover:border-foreground/40",
        sortable.isDragging && !isOverlay && "opacity-40",
        isOverlay && "shadow-2xl",
      )}
    >
      <div className="flex items-center gap-2">
        <BoardIcon
          name={cardType?.icon}
          className={cn("size-4 shrink-0", palette.text)}
        />
        <span className="min-w-0 font-mono text-xs text-muted-foreground/60">
          #{card.cardNumber}
        </span>
        {!card.isComplete && (
          <span
            title="Some required fields are still blank"
            aria-label="Incomplete"
            className="ms-auto grid size-5 shrink-0 place-items-center text-orange"
          >
            <CircleAlert className="size-4" />
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-3 text-s font-medium leading-snug text-foreground">
        {card.title}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {cardType && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              palette.text,
              palette.border,
            )}
          >
            {cardType.name}
          </span>
        )}

        <span className="ms-auto flex shrink-0 items-center gap-2">
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="size-3.5" />
              {card.commentCount}
            </span>
          )}
          {card.assignee ? (
            card.assignee.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.assignee.imageUrl}
                alt={card.assignee.name ?? ""}
                title={card.assignee.name ?? undefined}
                className="block size-5 rounded-full object-cover"
              />
            ) : (
              <span
                title={card.assignee.name ?? undefined}
                className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
              >
                {initialsOf(card.assignee.name)}
              </span>
            )
          ) : (
            <span
              title="Unassigned"
              aria-label="Unassigned"
              className="grid size-5 place-items-center rounded-full border border-muted-foreground/70 text-muted-foreground"
            >
              <UserRound className="size-3" />
            </span>
          )}
        </span>
      </div>
    </div>
  );
});
