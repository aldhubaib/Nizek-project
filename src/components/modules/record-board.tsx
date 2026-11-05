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
import { RecordCard, type RecordCardDisplay } from "./record-card";
import {
  RecordStageColumn,
  UnassignedColumn,
  UNASSIGNED_ID,
  stageIdFromDrop,
} from "./record-stage-column";
import type { RecordDTO } from "@/lib/modules/types";
import type { StageDTO } from "@/actions/record-stage";
import { columnDropHint } from "@/lib/workflow/engine";
import type { WorkflowPermissions } from "@/lib/workflow-permissions";
import type { WorkflowTransitionDTO } from "@/actions/workflow";

const BOARD_ROW =
  "flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2";

interface Props {
  stages: StageDTO[];
  records: RecordDTO[];
  onMoveRecord: (recordId: string, stageId: string | null) => void;
  onReorderStages: (orderedIds: string[]) => void;
  onAddStage: (name: string) => Promise<void>;
  onRenameStage: (
    stage: StageDTO,
    next: { name: string; color: string },
  ) => Promise<void>;
  onDeleteStage: (stage: StageDTO) => void;
  onOpenRecord: (record: RecordDTO) => void;
  emptyLabel?: string;
  cardDisplay?: RecordCardDisplay;
  transitions?: WorkflowTransitionDTO[];
  blueprintEnabled?: boolean;
  permissions?: WorkflowPermissions;
  canMoveRecords?: boolean;
  canManageStages?: boolean;
}

export function RecordBoard({
  stages,
  records,
  onMoveRecord,
  onReorderStages,
  onAddStage,
  onRenameStage,
  onDeleteStage,
  onOpenRecord,
  emptyLabel = "No records",
  cardDisplay,
  transitions = [],
  blueprintEnabled,
  permissions,
  canMoveRecords = true,
  canManageStages = true,
}: Props) {
  const [active, setActive] = useState<{
    id: string;
    type: "column" | "record";
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);
  const stageIdSet = useMemo(() => new Set(stageIds), [stageIds]);

  const byStage = useMemo(() => {
    const map = new Map<string, RecordDTO[]>();
    for (const stage of stages) map.set(stage.id, []);
    const unassigned: RecordDTO[] = [];
    for (const record of records) {
      const list = record.stageId ? map.get(record.stageId) : undefined;
      if (list) list.push(record);
      else unassigned.push(record);
    }
    const byTitle = (a: RecordDTO, b: RecordDTO) => a.title.localeCompare(b.title);
    for (const list of map.values()) list.sort(byTitle);
    unassigned.sort(byTitle);
    return { map, unassigned };
  }, [records, stages]);

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

  const activeRecord =
    active?.type === "record"
      ? records.find((d) => d.id === active.id) ?? null
      : null;

  const hintFor = (stageId: string | null) =>
    active?.type === "record"
      ? columnDropHint(stageId, {
          fromStatusId: activeRecord?.stageId ?? null,
          transitions,
          enabled: blueprintEnabled,
          permissions,
        })
      : null;

  function handleDragStart(event: DragStartEvent) {
    setActive({
      id: String(event.active.id),
      type: event.active.data.current?.type === "column" ? "column" : "record",
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

    const record = records.find((d) => d.id === activeDragId);
    if (!record || !canMoveRecords) return;

    const dropped = stageIdFromDrop(overId);
    const targetStageId =
      dropped !== undefined
        ? dropped
        : stageIdSet.has(overId)
          ? overId
          : undefined;
    if (targetStageId === undefined) return;
    if ((record.stageId ?? null) === targetStageId) return;

    onMoveRecord(record.id, targetStageId);
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
            records={byStage.unassigned}
            onOpenRecord={onOpenRecord}
            emptyLabel={emptyLabel}
            cardDisplay={cardDisplay}
            dropHint={hintFor(null)}
            draggingKind={active?.type ?? null}
            canMoveCards={canMoveRecords}
          />
        )}

        <SortableContext items={stageIds} strategy={horizontalListSortingStrategy}>
          {stages.map((stage) => (
            <RecordStageColumn
              key={stage.id}
              stage={stage}
              records={byStage.map.get(stage.id) ?? []}
              reorderable={canManageStages && stages.length > 1}
              onOpenRecord={onOpenRecord}
              emptyLabel={emptyLabel}
              cardDisplay={cardDisplay}
              onRename={onRenameStage}
              onDelete={onDeleteStage}
              canManage={canManageStages}
              canMoveCards={canMoveRecords}
              dropHint={hintFor(stage.id)}
              draggingKind={active?.type ?? null}
            />
          ))}
        </SortableContext>

        {canManageStages ? <AddStageColumn onAdd={onAddStage} /> : null}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeRecord ? (
          <RecordCard
            record={activeRecord}
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
