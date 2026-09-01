"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor, DEFAULT_BOARD_COLOR, DEFAULT_BOARD_ICON } from "@/lib/board-palette";
import {
  createBoardCardType,
  createBoardField,
  deleteBoardCardType,
  deleteBoardField,
  reorderBoardCardTypes,
  reorderBoardFields,
  updateBoardCardType,
  updateBoardField,
} from "@/actions/board-card-type";
import { BoardIcon } from "../board-icon";
import { ColorPicker, IconPicker, InlineName, ToggleRow } from "./settings-controls";
import type { BoardCardTypeDTO, BoardFieldDTO } from "@/actions/board";

interface Props {
  boardId: string;
  cardTypes: BoardCardTypeDTO[];
  onChanged: () => void;
  onError: (message: string) => void;
}

const FIELD_TYPES = [
  { id: "text", label: "Text" },
  { id: "select", label: "Choice" },
  { id: "link", label: "Link" },
  { id: "file", label: "File" },
];

function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Card types, and the fields each one asks a card to fill in.
 *
 * The shape mirrors the sprint side's default-question manager on purpose: a
 * label, a type, choices when it is a choice field, and whether an answer is
 * required. That similarity is what lets the same renderer draw both.
 */
export function CardTypeManager({ boardId, cardTypes, onChanged, onError }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(cardTypes[0]?.id ?? null);
  const [stylingId, setStylingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string>(DEFAULT_BOARD_ICON);
  const [newColor, setNewColor] = useState(DEFAULT_BOARD_COLOR);

  async function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.success) {
      onError(result.error ?? "Something went wrong.");
      return false;
    }
    onChanged();
    return true;
  }

  async function moveType(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= cardTypes.length) return;
    const ids = cardTypes.map((type) => type.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await run(() => reorderBoardCardTypes({ boardId, orderedIds: ids }));
  }

  return (
    <div className="space-y-3">
      {cardTypes.map((type, index) => {
        const palette = boardColor(type.color);
        const isOpen = expandedId === type.id;
        return (
          <div key={type.id} className="rounded-lg border border-border bg-field">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : type.id)}
                aria-label={isOpen ? "Collapse" : "Expand"}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
              <BoardIcon name={type.icon} className={cn("size-4 shrink-0", palette.text)} />
              <InlineName
                value={type.name}
                onSave={(next) =>
                  void run(() => updateBoardCardType({ cardTypeId: type.id, name: next }))
                }
                className="flex-1"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                {type.fields.length} {type.fields.length === 1 ? "field" : "fields"}
              </span>
              <button
                type="button"
                onClick={() => setStylingId(stylingId === type.id ? null : type.id)}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                Style
              </button>
              <button
                type="button"
                disabled={index === 0 || busy}
                onClick={() => void moveType(index, -1)}
                aria-label="Move up"
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={index === cardTypes.length - 1 || busy}
                onClick={() => void moveType(index, 1)}
                aria-label="Move down"
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => deleteBoardCardType(type.id))}
                aria-label={`Delete ${type.name}`}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {stylingId === type.id && (
              <div className="space-y-2 border-t border-border/50 px-3 py-2">
                <ColorPicker
                  value={type.color}
                  onChange={(next) =>
                    void run(() => updateBoardCardType({ cardTypeId: type.id, color: next }))
                  }
                />
                <IconPicker
                  value={type.icon}
                  onChange={(next) =>
                    void run(() => updateBoardCardType({ cardTypeId: type.id, icon: next }))
                  }
                />
              </div>
            )}

            {isOpen && (
              <FieldList
                cardType={type}
                busy={busy}
                run={run}
                onError={onError}
              />
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-border bg-field p-3">
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Card type name, e.g. Bug"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-s outline-none"
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <IconPicker value={newIcon} onChange={setNewIcon} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md px-3 py-1.5 text-s text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!newName.trim() || busy}
              onClick={async () => {
                const ok = await run(() =>
                  createBoardCardType({
                    boardId,
                    name: newName.trim(),
                    icon: newIcon,
                    color: newColor,
                  }),
                );
                if (ok) {
                  setNewName("");
                  setNewIcon(DEFAULT_BOARD_ICON);
                  setNewColor(DEFAULT_BOARD_COLOR);
                  setAdding(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-s font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3 animate-spin" />}
              Add card type
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-s text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add a card type
        </button>
      )}
    </div>
  );
}

function FieldList({
  cardType,
  busy,
  run,
}: {
  cardType: BoardCardTypeDTO;
  busy: boolean;
  run: (action: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function moveField(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= cardType.fields.length) return;
    const ids = cardType.fields.map((field) => field.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await run(() => reorderBoardFields({ cardTypeId: cardType.id, orderedIds: ids }));
  }

  return (
    <div className="space-y-2 border-t border-border/50 px-3 py-2.5">
      {cardType.fields.length === 0 && !adding && (
        <p className="py-1 text-xs text-muted-foreground">
          Cards of this type have no fields yet.
        </p>
      )}

      {cardType.fields.map((field, index) => (
        <div key={field.id} className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <InlineName
              value={field.label}
              onSave={(next) => void run(() => updateBoardField({ fieldId: field.id, label: next }))}
              className="flex-1"
            />
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {FIELD_TYPES.find((option) => option.id === field.type)?.label ?? field.type}
            </span>
            {field.required && (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-orange">
                Required
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditingId(editingId === field.id ? null : field.id)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={index === 0 || busy}
              onClick={() => void moveField(index, -1)}
              aria-label="Move up"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-3" />
            </button>
            <button
              type="button"
              disabled={index === cardType.fields.length - 1 || busy}
              onClick={() => void moveField(index, 1)}
              aria-label="Move down"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-3" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => deleteBoardField(field.id))}
              aria-label={`Delete ${field.label}`}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/60 hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          </div>

          {editingId === field.id && (
            <FieldEditor
              field={field}
              busy={busy}
              onSave={async (patch) => {
                const ok = await run(() => updateBoardField({ fieldId: field.id, ...patch }));
                if (ok) setEditingId(null);
              }}
            />
          )}
        </div>
      ))}

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2.5">
          <input
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Field label, e.g. Figma link"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-s outline-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none"
            >
              {FIELD_TYPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {type === "select" && (
            <>
              <input
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                placeholder="Choices, separated by commas"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-s outline-none"
              />
              <ToggleRow
                label="Allow more than one choice"
                checked={multiple}
                onChange={setMultiple}
              />
            </>
          )}
          <ToggleRow
            label="Required"
            hint="Cards missing this are flagged on the board, but can still be moved."
            checked={required}
            onChange={setRequired}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!label.trim() || busy}
              onClick={async () => {
                const ok = await run(() =>
                  createBoardField({
                    cardTypeId: cardType.id,
                    label: label.trim(),
                    type,
                    required,
                    multiple,
                    options: options
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  }),
                );
                if (ok) {
                  setLabel("");
                  setType("text");
                  setRequired(false);
                  setMultiple(false);
                  setOptions("");
                  setAdding(false);
                }
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add field
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-3" />
          Add a field
        </button>
      )}
    </div>
  );
}

function FieldEditor({
  field,
  busy,
  onSave,
}: {
  field: BoardFieldDTO;
  busy: boolean;
  onSave: (patch: {
    type?: string;
    required?: boolean;
    multiple?: boolean;
    options?: string[];
  }) => Promise<void>;
}) {
  const [type, setType] = useState(field.type);
  const [required, setRequired] = useState(field.required);
  const [multiple, setMultiple] = useState(field.multiple);
  const [options, setOptions] = useState(parseOptions(field.options).join(", "));

  return (
    <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
      <select
        value={type}
        onChange={(event) => setType(event.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none"
      >
        {FIELD_TYPES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {type === "select" && (
        <>
          <input
            value={options}
            onChange={(event) => setOptions(event.target.value)}
            placeholder="Choices, separated by commas"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-s outline-none"
          />
          <ToggleRow
            label="Allow more than one choice"
            checked={multiple}
            onChange={setMultiple}
          />
        </>
      )}
      <ToggleRow label="Required" checked={required} onChange={setRequired} />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onSave({
              type,
              required,
              multiple,
              options: options
                .split(",")
                .map((option) => option.trim())
                .filter(Boolean),
            })
          }
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
