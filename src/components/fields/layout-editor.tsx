"use client";

import { useState, useTransition, type ReactNode } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomField,
  createCustomFieldSection,
  deleteCustomField,
  deleteCustomFieldSection,
  placeCustomFields,
  updateCustomField,
  updateCustomFieldSection,
  type CustomFieldCatalogDTO,
  type CustomFieldDTO,
} from "@/actions/custom-field";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABEL,
} from "@/lib/fields/types";
import {
  RELATION_MODELS,
  RELATION_MODEL_LABEL,
  type RelationConfig,
} from "@/lib/fields/relations";
import type { WorkflowEntityType } from "@/lib/workflow/types";
import type { TextScript } from "@/lib/fields/text-config";
import {
  canControlVisibility,
  visibilityChoices,
  type FieldVisibility,
} from "@/lib/fields/visibility";
import { cn } from "@/lib/utils";

const UNSECTIONED = "unsectioned";

export function LayoutEditor({
  initial,
  entityType = "deal",
  onError,
  onCatalogChange,
}: {
  initial: CustomFieldCatalogDTO;
  entityType?: WorkflowEntityType;
  onError: (error: string | null) => void;
  onCatalogChange?: (catalog: CustomFieldCatalogDTO) => void;
}) {
  const [catalog, setCatalog] = useState(initial);
  const [pending, startPending] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const allFields = [
    ...catalog.unsectioned,
    ...catalog.sections.flatMap((s) => s.fields),
  ];
  const selected = allFields.find((f) => f.id === selectedId) ?? null;

  function run<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    apply: (data: T) => void,
  ) {
    startPending(async () => {
      const result = await fn();
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onError(null);
      apply(result.data);
    });
  }

  function setNextCatalog(
    updater: (prev: CustomFieldCatalogDTO) => CustomFieldCatalogDTO,
  ) {
    setCatalog((prev) => {
      const next = updater(prev);
      onCatalogChange?.(next);
      return next;
    });
  }

  function persistOrder(next: CustomFieldCatalogDTO) {
    if (!next.layoutId) return;
    run(
      () =>
        placeCustomFields({
          layoutId: next.layoutId!,
          placements: placementsOf(next),
        }),
      () => {},
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (!overId) return;
    const moved = String(event.active.id);
    const over = String(overId);
    const next = moveDraggedField(catalog, moved, over);
    if (!next) return;
    setNextCatalog(() => next);
    persistOrder(next);
  }

  function addField(type: (typeof CUSTOM_FIELD_TYPES)[number]) {
    const label = CUSTOM_FIELD_TYPE_LABEL[type];
    run(
      () =>
        createCustomField({
          entityType,
          layoutId: catalog.layoutId,
          label,
          type,
          sectionId: targetSectionId,
        }),
      (created) => {
        setNextCatalog((prev) => {
          if (created.sectionId) {
            return {
              ...prev,
              sections: prev.sections.map((s) =>
                s.id === created.sectionId
                  ? { ...s, fields: [...s.fields, created] }
                  : s,
              ),
            };
          }
          return { ...prev, unsectioned: [...prev.unsectioned, created] };
        });
        setSelectedId(created.id);
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_18rem]">
      <aside className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            New field
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {CUSTOM_FIELD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={pending || !catalog.layoutId}
                onClick={() => addField(type)}
                className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-start text-xs hover:bg-card disabled:opacity-50"
              >
                {CUSTOM_FIELD_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Add to section
          </p>
          <select
            value={targetSectionId ?? ""}
            onChange={(e) => setTargetSectionId(e.target.value || null)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="">Unsectioned</option>
            {catalog.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <Input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="Section name"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={pending || !sectionName.trim() || !catalog.layoutId}
              onClick={() => {
                const name = sectionName.trim();
                setSectionName("");
                run(
                  () =>
                    createCustomFieldSection({
                      entityType,
                      layoutId: catalog.layoutId,
                      name,
                    }),
                  (created) => {
                    setNextCatalog((prev) => ({
                      ...prev,
                      sections: [...prev.sections, created],
                    }));
                    setTargetSectionId(created.id);
                  },
                );
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="space-y-4 rounded-xl border border-border bg-card/30 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Create & edit form
        </p>
        <DndContext
          id={catalog.layoutId ? `layout-${catalog.layoutId}` : "layout-editor"}
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={onDragEnd}
        >
          {catalog.sections.map((section) => (
            <LayoutBlock
              key={section.id}
              droppableId={section.id}
              title={section.name}
              columns={section.columns}
              onColumns={(columns) =>
                run(
                  () => updateCustomFieldSection(section.id, { columns }),
                  (updated) =>
                    setNextCatalog((prev) => ({
                      ...prev,
                      sections: prev.sections.map((s) =>
                        s.id === section.id ? { ...s, columns: updated.columns } : s,
                      ),
                    })),
                )
              }
              onRename={(name) =>
                run(
                  () => updateCustomFieldSection(section.id, { name }),
                  () =>
                    setNextCatalog((prev) => ({
                      ...prev,
                      sections: prev.sections.map((s) =>
                        s.id === section.id ? { ...s, name } : s,
                      ),
                    })),
                )
              }
              onDelete={() => {
                if (!confirm(`Delete the “${section.name}” section? Fields stay.`)) {
                  return;
                }
                run(
                  () => deleteCustomFieldSection(section.id),
                  () => {
                    setNextCatalog((prev) => ({
                      ...prev,
                      unsectioned: [
                        ...prev.unsectioned,
                        ...section.fields.map((f) => ({ ...f, sectionId: null })),
                      ],
                      sections: prev.sections.filter((s) => s.id !== section.id),
                    }));
                    if (targetSectionId === section.id) setTargetSectionId(null);
                  },
                );
              }}
            >
              <SortableContext
                items={section.fields.map((field) => field.id)}
                strategy={
                  section.columns === 2
                    ? rectSortingStrategy
                    : verticalListSortingStrategy
                }
              >
                {section.fields.length === 0 ? (
                  <p className="col-span-full px-1 py-2 text-xs text-muted-foreground">
                    Drag a field here, or pick a type on the left.
                  </p>
                ) : (
                  section.fields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      selected={field.id === selectedId}
                      onSelect={() => setSelectedId(field.id)}
                    />
                  ))
                )}
              </SortableContext>
            </LayoutBlock>
          ))}
          <LayoutBlock droppableId={UNSECTIONED} title="More fields">
            <SortableContext
              items={catalog.unsectioned.map((field) => field.id)}
              strategy={verticalListSortingStrategy}
            >
              {catalog.unsectioned.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Drag a field here to leave it unsectioned.
                </p>
              ) : (
                catalog.unsectioned.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    selected={field.id === selectedId}
                    onSelect={() => setSelectedId(field.id)}
                  />
                ))
              )}
            </SortableContext>
          </LayoutBlock>
        </DndContext>
      </div>

      <aside className="rounded-xl border border-border bg-card/40 p-4">
        {selected ? (
          <FieldProperties
            field={selected}
            sections={catalog.sections}
            siblings={allFields}
            pending={pending}
            onUpdate={(patch) =>
              run(
                () => updateCustomField(selected.id, patch),
                (updated) => {
                  const moved =
                    patch.sectionId !== undefined &&
                    (selected.sectionId ?? null) !==
                      (updated.sectionId ?? null);
                  setNextCatalog((prev) => {
                    const next = upsertField(prev, updated);
                    if (moved) persistOrder(next);
                    return next;
                  });
                },
              )
            }
            onUpdateSibling={(id, visibility) =>
              run(
                () => updateCustomField(id, { visibility }),
                (updated) => {
                  setNextCatalog((prev) => upsertField(prev, updated));
                },
              )
            }
            onDelete={
              selected.binding === "title"
                ? undefined
                : () => {
                    if (!confirm(`Delete “${selected.label}”?`)) return;
                    run(
                      () => deleteCustomField(selected.id),
                      () => {
                        setNextCatalog((prev) => dropField(prev, selected.id));
                        setSelectedId(null);
                      },
                    );
                  }
            }
          />
        ) : (
          <p className="text-s text-muted-foreground">
            Select a field on the layout to edit its label, type, and whether it
            shows on create or edit.
          </p>
        )}
      </aside>
    </div>
  );
}

function LayoutBlock({
  title,
  children,
  droppableId,
  columns = 1,
  onColumns,
  onRename,
  onDelete,
}: {
  title: string;
  children: ReactNode;
  droppableId?: string;
  columns?: number;
  onColumns?: (columns: 1 | 2) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId ?? title,
    disabled: !droppableId,
  });
  const two = columns === 2;

  return (
    <section
      ref={droppableId ? setNodeRef : undefined}
      className={cn(
        "rounded-lg border border-border/60 bg-background/40 p-3",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {onRename ? (
          <input
            defaultValue={title}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== title) onRename(name);
            }}
            className="h-7 min-w-0 flex-1 bg-transparent text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none"
          />
        ) : (
          <p className="flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        )}
        {onColumns && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={two}
              onChange={(e) => onColumns(e.target.checked ? 2 : 1)}
            />
            2 columns
          </label>
        )}
        {onDelete && (
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className={two ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
        {children}
      </div>
    </section>
  );
}

function FieldRow({
  field,
  selected,
  onSelect,
}: {
  field: CustomFieldDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex w-full items-center gap-1 rounded-md border px-2 py-2",
        selected ? "border-primary bg-primary/5" : "border-border bg-background/60",
        isDragging && "z-10 opacity-70",
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Drag ${field.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center justify-between text-start"
      >
        <span className="truncate text-s">
          {field.label}
          {field.required && <span className="ms-1 text-destructive">*</span>}
        </span>
        <span className="ms-2 shrink-0 text-xs text-muted-foreground">
          {field.type === "relation"
            ? RELATION_MODEL_LABEL[field.relation?.model ?? "company"]
            : CUSTOM_FIELD_TYPE_LABEL[field.type]}
        </span>
      </button>
    </div>
  );
}

function FieldProperties({
  field,
  sections,
  siblings,
  pending,
  onUpdate,
  onUpdateSibling,
  onDelete,
}: {
  field: CustomFieldDTO;
  sections: CustomFieldCatalogDTO["sections"];
  siblings: CustomFieldDTO[];
  pending: boolean;
  onUpdate: (input: {
    label?: string;
    type?: string;
    options?: string[];
    relation?: RelationConfig;
    userMultiple?: boolean;
    countryMultiple?: boolean;
    script?: TextScript | null;
    required?: boolean;
    showOn?: string;
    visibility?: FieldVisibility | null;
    sectionId?: string | null;
  }) => void;
  onUpdateSibling: (id: string, visibility: FieldVisibility | null) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Field
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          key={field.id + field.label}
          defaultValue={field.label}
          onBlur={(e) => {
            const label = e.target.value.trim();
            if (label && label !== field.label) onUpdate({ label });
          }}
        />
      </div>
      {!field.binding && (
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <select
            value={field.type}
            disabled={pending}
            onChange={(e) => onUpdate({ type: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            {CUSTOM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {CUSTOM_FIELD_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Section</Label>
        <select
          value={field.sectionId ?? ""}
          disabled={pending}
          onChange={(e) => onUpdate({ sectionId: e.target.value || null })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
        >
          <option value="">Unsectioned</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Show on</Label>
        <select
          value={field.showOn}
          disabled={pending}
          onChange={(e) => onUpdate({ showOn: e.target.value })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
        >
          <option value="both">Create & edit</option>
          <option value="create">Create only</option>
          <option value="edit">Edit only</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-s">
        <input
          type="checkbox"
          checked={field.required}
          disabled={field.binding === "title"}
          onChange={(e) => onUpdate({ required: e.target.checked })}
        />
        Required
        {field.binding === "title" && (
          <span className="text-xs text-muted-foreground">Always on</span>
        )}
      </label>
      {field.type === "text" && (
        <label className="flex items-center gap-2 text-s">
          <input
            type="checkbox"
            checked={field.script === "arabic"}
            disabled={pending}
            onChange={(e) =>
              onUpdate({ script: e.target.checked ? "arabic" : null })
            }
          />
          Arabic only
        </label>
      )}
      {field.type === "cost" && (
        <p className="text-xs text-muted-foreground">
          Title and cost rows, with a running total.
        </p>
      )}
      {field.type === "priority" && (
        <p className="text-xs text-muted-foreground">
          Very high, High, Normal, Low, Very low.
        </p>
      )}
      {field.type === "invite" && (
        <p className="text-xs text-muted-foreground">
          Attendance, time, and a Google Maps pin on the form. Sending waits for a
          Send invite action on the blueprint.
        </p>
      )}
      {field.type === "user" && !field.binding && (
        <div className="space-y-1.5">
          <Label className="text-xs">Picker</Label>
          <select
            value={field.userMultiple ? "many" : "one"}
            disabled={pending}
            onChange={(e) =>
              onUpdate({ userMultiple: e.target.value === "many" })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="one">One person</option>
            <option value="many">Several people</option>
          </select>
        </div>
      )}
      {field.type === "country" && !field.binding && (
        <div className="space-y-1.5">
          <Label className="text-xs">Picker</Label>
          <select
            value={field.countryMultiple ? "many" : "one"}
            disabled={pending}
            onChange={(e) =>
              onUpdate({ countryMultiple: e.target.value === "many" })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="one">One country</option>
            <option value="many">Several countries</option>
          </select>
        </div>
      )}
      {field.type === "relation" && !field.binding && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Link to</Label>
            <select
              value={field.relation?.model ?? "company"}
              disabled={pending}
              onChange={(e) =>
                onUpdate({
                  relation: {
                    model: e.target.value as RelationConfig["model"],
                    multiple: field.relation?.multiple ?? true,
                  },
                })
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
            >
              {RELATION_MODELS.map((model) => (
                <option key={model} value={model}>
                  {RELATION_MODEL_LABEL[model]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {field.relation?.multiple === false
                ? "Shows as a dropdown on the form."
                : "Shows under Related data on the form."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-s">
            <input
              type="checkbox"
              checked={field.relation?.multiple ?? true}
              onChange={(e) =>
                onUpdate({
                  relation: {
                    model: field.relation?.model ?? "company",
                    multiple: e.target.checked,
                  },
                })
              }
            />
            Allow many
          </label>
        </>
      )}
      {(field.type === "select" ||
        field.type === "multi_select" ||
        field.type === "checkbox") && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {field.type === "checkbox" ? "Values (one per line)" : "Options (one per line)"}
          </Label>
          <textarea
            key={field.id + field.options.join("|")}
            defaultValue={field.options.join("\n")}
            placeholder={
              field.type === "checkbox"
                ? "Option A\nOption B"
                : undefined
            }
            onBlur={(e) =>
              onUpdate({
                options: e.target.value
                  .split(/\n|,/)
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
            className="min-h-24 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-s"
          />
        </div>
      )}
      {canControlVisibility(field) && (
        <SituationsEditor
          field={field}
          siblings={siblings}
          pending={pending}
          onUpdateSibling={onUpdateSibling}
        />
      )}
      {field.binding !== "title" && (
        <VisibilityRules
          field={field}
          siblings={siblings}
          pending={pending}
          onUpdate={(visibility) => onUpdate({ visibility })}
        />
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="me-1.5 h-3.5 w-3.5" />
          Delete field
        </Button>
      )}
    </div>
  );
}

function SituationsEditor({
  field,
  siblings,
  pending,
  onUpdateSibling,
}: {
  field: CustomFieldDTO;
  siblings: CustomFieldDTO[];
  pending: boolean;
  onUpdateSibling: (id: string, visibility: FieldVisibility | null) => void;
}) {
  const options = visibilityChoices(field);
  const targets = siblings.filter(
    (sibling) => sibling.id !== field.id && sibling.binding !== "title",
  );

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add options above, then tick which fields should appear for each one.
      </p>
    );
  }

  if (targets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add another field (for example a relation), then tick it under the
        option that should reveal it.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">Situations</Label>
      <p className="text-xs text-muted-foreground">
        Tick the fields that should appear for each option.
      </p>
      {options.map((choice) => (
        <div
          key={choice.value}
          className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
        >
          <p className="text-xs text-muted-foreground">When {choice.label}</p>
          {targets.map((target) => {
            const rule = target.visibility;
            const tiedToThis = rule?.dependsOn === field.id;
            const locked = Boolean(rule?.dependsOn && rule.dependsOn !== field.id);
            const checked = tiedToThis && (rule?.values.includes(choice.value) ?? false);
            return (
              <label key={target.id} className="flex items-center gap-2 text-s">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending || locked}
                  onChange={() => {
                    const current = tiedToThis ? (rule?.values ?? []) : [];
                    const values = checked
                      ? current.filter((item) => item !== choice.value)
                      : [...current, choice.value];
                    onUpdateSibling(
                      target.id,
                      values.length > 0
                        ? { dependsOn: field.id, values }
                        : null,
                    );
                  }}
                />
                <span className="min-w-0 truncate">{target.label}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function VisibilityRules({
  field,
  siblings,
  pending,
  onUpdate,
}: {
  field: CustomFieldDTO;
  siblings: CustomFieldDTO[];
  pending: boolean;
  onUpdate: (visibility: FieldVisibility | null) => void;
}) {
  const controllers = siblings.filter(
    (sibling) => sibling.id !== field.id && canControlVisibility(sibling),
  );
  const rule = field.visibility;
  const controller =
    controllers.find((sibling) => sibling.id === rule?.dependsOn) ?? null;
  const choices = controller ? visibilityChoices(controller) : [];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Show when</Label>
      {controllers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add a pick list (or checkbox) to this layout to hide this field
          unless that list equals a value you choose.
        </p>
      ) : (
        <>
          <select
            value={rule?.dependsOn ?? ""}
            disabled={pending}
            onChange={(e) => {
              const dependsOn = e.target.value;
              if (!dependsOn) {
                onUpdate(null);
                return;
              }
              onUpdate({ dependsOn, values: [] });
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-s"
          >
            <option value="">Always</option>
            {controllers.map((sibling) => (
              <option key={sibling.id} value={sibling.id}>
                {sibling.label}
              </option>
            ))}
          </select>
          {controller && choices.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add options on “{controller.label}” first.
            </p>
          )}
          {controller && choices.length > 0 && (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
              <p className="text-xs text-muted-foreground">equals</p>
              {choices.map((choice) => {
                const checked = rule?.values.includes(choice.value) ?? false;
                return (
                  <label key={choice.value} className="flex items-center gap-2 text-s">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={() => {
                        const current = rule?.values ?? [];
                        const values = checked
                          ? current.filter((item) => item !== choice.value)
                          : [...current, choice.value];
                        onUpdate({
                          dependsOn: controller.id,
                          values,
                        });
                      }}
                    />
                    {choice.label}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sectionIdOf(
  catalog: CustomFieldCatalogDTO,
  fieldId: string,
): string | null {
  if (catalog.unsectioned.some((field) => field.id === fieldId)) return null;
  return (
    catalog.sections.find((section) =>
      section.fields.some((field) => field.id === fieldId),
    )?.id ?? null
  );
}

function replaceField(
  prev: CustomFieldCatalogDTO,
  field: CustomFieldDTO,
): CustomFieldCatalogDTO {
  return {
    ...prev,
    sections: prev.sections.map((section) => ({
      ...section,
      fields: section.fields.map((row) => (row.id === field.id ? field : row)),
    })),
    unsectioned: prev.unsectioned.map((row) =>
      row.id === field.id ? field : row,
    ),
  };
}

/** Keep slot on property edits; only jump when the section actually changes. */
function upsertField(
  prev: CustomFieldCatalogDTO,
  field: CustomFieldDTO,
): CustomFieldCatalogDTO {
  if (sectionIdOf(prev, field.id) === (field.sectionId ?? null)) {
    return replaceField(prev, field);
  }
  return moveField(prev, field);
}

function moveField(
  prev: CustomFieldCatalogDTO,
  field: CustomFieldDTO,
): CustomFieldCatalogDTO {
  const without = dropField(prev, field.id);
  if (field.sectionId) {
    return {
      ...without,
      sections: without.sections.map((s) =>
        s.id === field.sectionId ? { ...s, fields: [...s.fields, field] } : s,
      ),
    };
  }
  return { ...without, unsectioned: [...without.unsectioned, field] };
}

function dropField(
  prev: CustomFieldCatalogDTO,
  id: string,
): CustomFieldCatalogDTO {
  return {
    layoutId: prev.layoutId,
    sections: prev.sections.map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.id !== id),
    })),
    unsectioned: prev.unsectioned.filter((f) => f.id !== id),
  };
}

function placementsOf(catalog: CustomFieldCatalogDTO) {
  return [
    ...catalog.sections.flatMap((section) =>
      section.fields.map((field) => ({ id: field.id, sectionId: section.id })),
    ),
    ...catalog.unsectioned.map((field) => ({ id: field.id, sectionId: null })),
  ];
}

function containerOf(catalog: CustomFieldCatalogDTO, id: string): string | null {
  if (id === UNSECTIONED) return UNSECTIONED;
  if (catalog.sections.some((section) => section.id === id)) return id;
  if (catalog.unsectioned.some((field) => field.id === id)) return UNSECTIONED;
  return (
    catalog.sections.find((section) =>
      section.fields.some((field) => field.id === id),
    )?.id ?? null
  );
}

function fieldsIn(
  catalog: CustomFieldCatalogDTO,
  containerId: string,
): CustomFieldDTO[] {
  if (containerId === UNSECTIONED) return catalog.unsectioned;
  return catalog.sections.find((section) => section.id === containerId)?.fields ?? [];
}

function withFields(
  catalog: CustomFieldCatalogDTO,
  containerId: string,
  fields: CustomFieldDTO[],
): CustomFieldCatalogDTO {
  if (containerId === UNSECTIONED) return { ...catalog, unsectioned: fields };
  return {
    ...catalog,
    sections: catalog.sections.map((section) =>
      section.id === containerId ? { ...section, fields } : section,
    ),
  };
}

function moveDraggedField(
  catalog: CustomFieldCatalogDTO,
  movedId: string,
  overId: string,
): CustomFieldCatalogDTO | null {
  const fromId = containerOf(catalog, movedId);
  const toId = containerOf(catalog, overId);
  if (!fromId || !toId) return null;

  const fromList = fieldsIn(catalog, fromId);
  const oldIndex = fromList.findIndex((field) => field.id === movedId);
  if (oldIndex < 0) return null;

  if (fromId === toId) {
    const overIndex = fromList.findIndex((field) => field.id === overId);
    const nextIndex = overIndex < 0 ? fromList.length - 1 : overIndex;
    if (oldIndex === nextIndex) return null;
    return withFields(catalog, fromId, arrayMove(fromList, oldIndex, nextIndex));
  }

  const moved = {
    ...fromList[oldIndex],
    sectionId: toId === UNSECTIONED ? null : toId,
  };
  const toList = fieldsIn(catalog, toId);
  const overIndex = toList.findIndex((field) => field.id === overId);
  const insertAt = overIndex < 0 ? toList.length : overIndex;
  const nextTo = [...toList];
  nextTo.splice(insertAt, 0, moved);
  return withFields(
    withFields(catalog, fromId, fromList.filter((field) => field.id !== movedId)),
    toId,
    nextTo,
  );
}
