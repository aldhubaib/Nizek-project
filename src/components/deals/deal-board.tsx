"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DealCard, type DealCardDisplay } from "./deal-card";
import {
  DealStageColumn,
  UnassignedColumn,
  UNASSIGNED_ID,
  stageIdFromDrop,
} from "./deal-stage-column";
import type { DealDTO } from "@/actions/deal";
import type { DealStageDTO } from "@/actions/deal-stage";
import { columnDropHint } from "@/lib/workflow/engine";
import type { WorkflowPermissions } from "@/lib/workflow-permissions";
import type { WorkflowTransitionDTO } from "@/actions/workflow";

const BOARD_ROW =
  "flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2";

interface Props {
  stages: DealStageDTO[];
  deals: DealDTO[];
  onMoveDeal: (dealId: string, stageId: string | null) => void;
  onReorderStages: (orderedIds: string[]) => void;
  onAddStage: (name: string) => Promise<void>;
  onRenameStage: (
    stage: DealStageDTO,
    next: { name: string; color: string },
  ) => Promise<void>;
  onDeleteStage: (stage: DealStageDTO) => void;
  onOpenDeal: (deal: DealDTO) => void;
  emptyLabel?: string;
  cardDisplay?: DealCardDisplay;
  transitions?: WorkflowTransitionDTO[];
  blueprintEnabled?: boolean;
  permissions?: WorkflowPermissions;
  canMoveDeals?: boolean;
  canManageStages?: boolean;
}

export function DealBoard({
  stages,
  deals,
  onMoveDeal,
  onReorderStages,
  onAddStage,
  onRenameStage,
  onDeleteStage,
  onOpenDeal,
  emptyLabel = "No deals",
  cardDisplay,
  transitions = [],
  blueprintEnabled,
  permissions,
  canMoveDeals = true,
  canManageStages = true,
}: Props) {
  const [active, setActive] = useState<{
    id: string;
    type: "column" | "deal";
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);
  const stageIdSet = useMemo(() => new Set(stageIds), [stageIds]);

  const byStage = useMemo(() => {
    const map = new Map<string, DealDTO[]>();
    for (const stage of stages) map.set(stage.id, []);
    const unassigned: DealDTO[] = [];
    for (const deal of deals) {
      const list = deal.stageId ? map.get(deal.stageId) : undefined;
      if (list) list.push(deal);
      else unassigned.push(deal);
    }
    const byTitle = (a: DealDTO, b: DealDTO) => a.title.localeCompare(b.title);
    for (const list of map.values()) list.sort(byTitle);
    unassigned.sort(byTitle);
    return { map, unassigned };
  }, [deals, stages]);

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (args.active.data.current?.type === "column") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            stageIdSet.has(String(container.id)),
          ),
        });
      }
      const hits = pointerWithin(args);
      return hits.length > 0 ? hits : closestCorners(args);
    },
    [stageIdSet],
  );

  const activeDeal =
    active?.type === "deal"
      ? deals.find((d) => d.id === active.id) ?? null
      : null;

  const hintFor = (stageId: string | null) =>
    active?.type === "deal"
      ? columnDropHint(stageId, {
          fromStatusId: activeDeal?.stageId ?? null,
          transitions,
          enabled: blueprintEnabled,
          permissions,
        })
      : null;

  function handleDragStart(event: DragStartEvent) {
    setActive({
      id: String(event.active.id),
      type: event.active.data.current?.type === "column" ? "column" : "deal",
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);

    const { over } = event;
    if (!over) return;

    const activeDragId = String(event.active.id);
    const overId = String(over.id);
    if (activeDragId === overId) return;

    if (event.active.data.current?.type === "column") {
      if (!canManageStages) return;
      const from = stages.findIndex((s) => s.id === activeDragId);
      const to = stages.findIndex((s) => s.id === overId);
      if (from === -1 || to === -1) return;
      onReorderStages(arrayMove(stageIds, from, to));
      return;
    }

    const deal = deals.find((d) => d.id === activeDragId);
    if (!deal || !canMoveDeals) return;

    const dropped = stageIdFromDrop(overId);
    const targetStageId =
      dropped !== undefined
        ? dropped
        : stageIdSet.has(overId)
          ? overId
          : undefined;
    if (targetStageId === undefined) return;
    if ((deal.stageId ?? null) === targetStageId) return;

    onMoveDeal(deal.id, targetStageId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className={BOARD_ROW}>
        {byStage.unassigned.length > 0 && (
          <UnassignedColumn
            deals={byStage.unassigned}
            onOpenDeal={onOpenDeal}
            emptyLabel={emptyLabel}
            cardDisplay={cardDisplay}
            dropHint={hintFor(null)}
            draggingKind={active?.type ?? null}
            canMoveCards={canMoveDeals}
          />
        )}

        <SortableContext items={stageIds} strategy={horizontalListSortingStrategy}>
          {stages.map((stage) => (
            <DealStageColumn
              key={stage.id}
              stage={stage}
              deals={byStage.map.get(stage.id) ?? []}
              reorderable={canManageStages && stages.length > 1}
              onOpenDeal={onOpenDeal}
              emptyLabel={emptyLabel}
              cardDisplay={cardDisplay}
              onRename={onRenameStage}
              onDelete={onDeleteStage}
              canManage={canManageStages}
              canMoveCards={canMoveDeals}
              dropHint={hintFor(stage.id)}
              draggingKind={active?.type ?? null}
            />
          ))}
        </SortableContext>

        {canManageStages ? <AddStageColumn onAdd={onAddStage} /> : null}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <DealCard
            deal={activeDeal}
            isOverlay
            draggable={false}
            display={cardDisplay}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function AddStageColumn({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    await onAdd(trimmed);
    setSaving(false);
    setName("");
  }

  if (!composing) {
    return (
      <button
        type="button"
        onClick={() => setComposing(true)}
        className="flex h-fit w-[280px] shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-s text-muted-foreground transition-colors hover:border-border hover:bg-accent/20 hover:text-foreground"
      >
        <Plus className="size-4" />
        Add column
      </button>
    );
  }

  return (
    <div className="h-fit w-[280px] shrink-0 rounded-lg border border-border bg-muted/30 p-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setComposing(false);
            setName("");
          }
        }}
        placeholder="Column name"
        className="h-8 text-s"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setComposing(false);
            setName("");
          }}
          aria-label="Cancel"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
