"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/boards/board-settings/settings-controls";
import { boardColor } from "@/lib/board-palette";
import { cn } from "@/lib/utils";
import { DealCard, type DealCardDisplay } from "./deal-card";
import type { DealDTO } from "@/actions/deal";
import type { DealStageDTO } from "@/actions/deal-stage";

export const UNASSIGNED_ID = "__unassigned";

const COLUMN_SHELL =
  "flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-colors";

const OVER_SHELL = "border-primary/60 bg-primary/5";

interface CardListProps {
  deals: DealDTO[];
  emptyLabel: string;
  onOpenDeal: (deal: DealDTO) => void;
  cardDisplay?: DealCardDisplay;
}

function CardList({ deals, emptyLabel, onOpenDeal, cardDisplay }: CardListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain p-2">
      {deals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          onOpen={onOpenDeal}
          display={cardDisplay}
        />
      ))}
      {deals.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="text-s text-muted-foreground/60">{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}

interface ColumnProps extends CardListProps {
  stage: DealStageDTO;
  onRename: (
    stage: DealStageDTO,
    next: { name: string; color: string },
  ) => Promise<void>;
  onDelete: (stage: DealStageDTO) => void;
  reorderable: boolean;
}

export function DealStageColumn({
  stage,
  deals,
  onOpenDeal,
  emptyLabel,
  cardDisplay,
  onRename,
  onDelete,
  reorderable,
}: ColumnProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: stage.id,
    data: { type: "column" },
    disabled: { draggable: !reorderable, droppable: false },
  });
  const palette = boardColor(stage.color);
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        COLUMN_SHELL,
        isOver && OVER_SHELL,
        isDragging && "z-10 opacity-60 shadow-2xl",
      )}
    >
      <div className="flex items-center gap-1 border-b border-border/50 px-2 py-2.5">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5",
            reorderable && "cursor-grab active:cursor-grabbing",
          )}
        >
          {reorderable && (
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <div className={cn("size-2.5 shrink-0 rounded-full", palette.dot)} />
          <h3 className="truncate text-s font-medium">{stage.name}</h3>
          <span className="shrink-0 text-s text-muted-foreground">
            {deals.length}
          </span>
        </div>

        <Popover open={editorOpen} onOpenChange={setEditorOpen}>
          <PopoverTrigger
            aria-label={`Edit ${stage.name}`}
            title="Edit column"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <span aria-hidden className="text-m leading-none">
              ⋯
            </span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <StageEditor
              key={`${stage.name}-${stage.color}`}
              stage={stage}
              onSave={async (next) => {
                await onRename(stage, next);
                setEditorOpen(false);
              }}
              onDelete={() => {
                setEditorOpen(false);
                onDelete(stage);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <CardList
        deals={deals}
        emptyLabel={emptyLabel}
        onOpenDeal={onOpenDeal}
        cardDisplay={cardDisplay}
      />
    </div>
  );
}

export function UnassignedColumn({
  deals,
  onOpenDeal,
  emptyLabel,
  cardDisplay,
}: CardListProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNASSIGNED_ID,
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(COLUMN_SHELL, "border-dashed", isOver && OVER_SHELL)}
    >
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2.5">
        <h3 className="truncate text-s font-medium text-muted-foreground">
          Unassigned
        </h3>
        <span className="shrink-0 text-s text-muted-foreground">
          {deals.length}
        </span>
      </div>
      <CardList
        deals={deals}
        emptyLabel={emptyLabel}
        onOpenDeal={onOpenDeal}
        cardDisplay={cardDisplay}
      />
    </div>
  );
}

function StageEditor({
  stage,
  onSave,
  onDelete,
}: {
  stage: DealStageDTO;
  onSave: (next: { name: string; color: string }) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== stage.name || color !== stage.color;

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave({ name: name.trim(), color });
    setSaving(false);
  }

  return (
    <div className="space-y-2.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="Column name"
        className="h-8 text-s"
        autoFocus
      />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!name.trim() || !dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ms-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
