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
import { ContactCard } from "./contact-card";
import {
  ContactStageColumn,
  UnassignedColumn,
  UNASSIGNED_ID,
} from "./contact-stage-column";
import type { ContactDTO } from "@/actions/contact";
import type { ContactStageDTO } from "@/actions/contact-stage";

const BOARD_ROW =
  "flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2";

interface Props {
  stages: ContactStageDTO[];
  /** Already filtered by the page's search box. */
  contacts: ContactDTO[];
  busyId: string | null;
  onMoveContact: (contactId: string, stageId: string | null) => void;
  onReorderStages: (orderedIds: string[]) => void;
  onAddStage: (name: string) => Promise<void>;
  onRenameStage: (
    stage: ContactStageDTO,
    next: { name: string; color: string },
  ) => Promise<void>;
  onDeleteStage: (stage: ContactStageDTO) => void;
  onOpenContact: (contact: ContactDTO) => void;
  onDeleteContact: (contact: ContactDTO) => void;
  onAddContact: (stageId: string) => void;
}

export function ContactBoard({
  stages,
  contacts,
  busyId,
  onMoveContact,
  onReorderStages,
  onAddStage,
  onRenameStage,
  onDeleteStage,
  onOpenContact,
  onDeleteContact,
  onAddContact,
}: Props) {
  // What is in the air, kept in state rather than a ref because the overlay is
  // rendered from it.
  const [active, setActive] = useState<{
    id: string;
    type: "column" | "contact";
  } | null>(null);

  const sensors = useSensors(
    // A card is also a click target for the editor, so a drag has to be a
    // deliberate movement rather than a twitch.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);
  const stageIdSet = useMemo(() => new Set(stageIds), [stageIds]);

  const byStage = useMemo(() => {
    const map = new Map<string, ContactDTO[]>();
    for (const stage of stages) map.set(stage.id, []);
    const unassigned: ContactDTO[] = [];
    for (const contact of contacts) {
      const list = contact.stageId ? map.get(contact.stageId) : undefined;
      if (list) list.push(contact);
      else unassigned.push(contact);
    }
    const byName = (a: ContactDTO, b: ContactDTO) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    for (const list of map.values()) list.sort(byName);
    unassigned.sort(byName);
    return { map, unassigned };
  }, [contacts, stages]);

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // A column only ever trades places with another column, so the bucket for
      // unplaced contacts and every card are taken off the table first.
      if (args.active.data.current?.type === "column") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            stageIdSet.has(String(container.id)),
          ),
        });
      }
      // Cards are draggable but not droppable, so whatever the pointer is
      // inside of is a column. Falling back to proximity keeps a drop that
      // lands in the gap between two columns from being thrown away.
      const hits = pointerWithin(args);
      return hits.length > 0 ? hits : closestCorners(args);
    },
    [stageIdSet],
  );

  const activeContact =
    active?.type === "contact"
      ? contacts.find((c) => c.id === active.id) ?? null
      : null;

  function handleDragStart(event: DragStartEvent) {
    setActive({
      id: String(event.active.id),
      type: event.active.data.current?.type === "column" ? "column" : "contact",
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);

    const { over } = event;
    if (!over) return;

    const activeDragId = String(event.active.id);
    const overId = String(over.id);
    if (activeDragId === overId) return;

    // Read off the event rather than the `active` state: the handler closes
    // over whatever render it was created in, and the event is always current.
    if (event.active.data.current?.type === "column") {
      const from = stages.findIndex((s) => s.id === activeDragId);
      const to = stages.findIndex((s) => s.id === overId);
      if (from === -1 || to === -1) return;
      onReorderStages(arrayMove(stageIds, from, to));
      return;
    }

    const contact = contacts.find((c) => c.id === activeDragId);
    if (!contact) return;

    // Anything that is not a known column is not a drop target.
    const targetStageId =
      overId === UNASSIGNED_ID
        ? null
        : stageIdSet.has(overId)
          ? overId
          : undefined;
    if (targetStageId === undefined) return;
    if ((contact.stageId ?? null) === targetStageId) return;

    onMoveContact(contact.id, targetStageId);
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
        {/* Only shown while it holds somebody — normally the leftovers of a
            deleted column — so an ordinary board is not carrying a spare. */}
        {byStage.unassigned.length > 0 && (
          <UnassignedColumn
            contacts={byStage.unassigned}
            busyId={busyId}
            onOpenContact={onOpenContact}
            onDeleteContact={onDeleteContact}
          />
        )}

        <SortableContext items={stageIds} strategy={horizontalListSortingStrategy}>
          {stages.map((stage) => (
            <ContactStageColumn
              key={stage.id}
              stage={stage}
              contacts={byStage.map.get(stage.id) ?? []}
              busyId={busyId}
              reorderable={stages.length > 1}
              onOpenContact={onOpenContact}
              onDeleteContact={onDeleteContact}
              onAddContact={onAddContact}
              onRename={onRenameStage}
              onDelete={onDeleteStage}
            />
          ))}
        </SortableContext>

        <AddStageColumn onAdd={onAddStage} />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeContact ? (
          <ContactCard contact={activeContact} isOverlay draggable={false} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** The trailing slot that turns into a name box. */
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
    // Stays open so a pipeline can be typed out in one go.
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
