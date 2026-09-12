"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleAlert, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor } from "@/lib/board-palette";
import { dueState, formatDue, type DueState } from "@/lib/board-dates";
import { BoardIcon } from "./board-icon";
import { LabelChip } from "./card-labels";
import { MemberAvatar } from "./member-avatar";
import type { BoardCardDTO, BoardCardTypeDTO, BoardLabelDTO } from "@/actions/board";

/** Only overdue and nearly-due earn a colour; the rest stay quiet. */
const DUE_TONE: Record<DueState, string> = {
  done: "bg-success/10 text-success",
  overdue: "bg-destructive/15 text-destructive",
  soon: "bg-orange/15 text-orange",
  later: "text-muted-foreground",
};

interface Props {
  card: BoardCardDTO;
  cardType: BoardCardTypeDTO | undefined;
  /** Only the ones on this card, resolved by the canvas. */
  labels?: BoardLabelDTO[];
  onOpen?: (cardId: string) => void;
  /** Off for a read-only viewer, and for the drag overlay copy. */
  draggable?: boolean;
  isOverlay?: boolean;
}

export const BoardCard = memo(function BoardCard({
  card,
  cardType,
  labels,
  onOpen,
  draggable = true,
  isOverlay = false,
}: Props) {
  const sortable = useSortable({ id: card.id, disabled: !draggable });
  const palette = boardColor(cardType?.color);
  const due = dueState(card);

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

      {labels && labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}

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

        {due && (
          <span
            title={card.dueDone ? "Due date, done" : "Due"}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
              DUE_TONE[due],
            )}
          >
            <Clock className="size-3" />
            {formatDue(card.dueDate!)}
          </span>
        )}

        <span className="ms-auto flex shrink-0 items-center gap-2">
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="size-3.5" />
              {card.commentCount}
            </span>
          )}
          <span title={card.assignee?.name ?? "Unassigned"}>
            <MemberAvatar person={card.assignee} />
          </span>
        </span>
      </div>
    </div>
  );
});
