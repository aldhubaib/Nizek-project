"use client";

import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_COLORS, boardColor } from "@/lib/board-palette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createBoardLabel,
  deleteBoardLabel,
  updateBoardLabel,
  type BoardLabelDTO,
} from "@/actions/board";
import { toggleBoardCardLabel } from "@/actions/board-card";

interface Props {
  boardId: string;
  cardId: string;
  /** Every label the board has. */
  labels: BoardLabelDTO[];
  /** The ones on this card. */
  labelIds: string[];
  canEdit: boolean;
  /** Inventing, renaming and deleting a label, as against applying one. */
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}

/**
 * A label as it reads on a card: a colour bar, with its name inside if it has
 * one. Small on the card front, where it sits above the title; large on the
 * card back, where it is a thing you click.
 */
export function LabelChip({
  label,
  size = "sm",
  className,
}: {
  label: BoardLabelDTO;
  size?: "sm" | "lg";
  className?: string;
}) {
  const palette = boardColor(label.color);
  const named = Boolean(label.name);
  return (
    <span
      title={named ? label.name : `Colour: ${palette.label}, no name`}
      className={cn(
        "inline-flex items-center rounded font-medium text-background",
        palette.dot,
        size === "lg" ? "h-8 px-3 text-s" : "h-5 px-2 text-xs",
        // An unnamed label is a bare stripe, so it needs a width of its own.
        !named && (size === "lg" ? "w-14" : "w-10"),
        className,
      )}
    >
      {label.name}
    </span>
  );
}

export function CardLabels({
  boardId,
  cardId,
  labels,
  labelIds,
  canEdit,
  canManage,
  onChanged,
  onError,
}: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BoardLabelDTO | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(BOARD_COLORS[1].id);
  const [busy, setBusy] = useState(false);

  const on = new Set(labelIds);
  const applied = labels.filter((label) => on.has(label.id));

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? labels.filter(
        (label) =>
          label.name.toLowerCase().includes(needle) ||
          // Searching "green" should find the green one even if nobody named it.
          boardColor(label.color).label.toLowerCase().includes(needle),
      )
    : labels;

  async function run(work: () => Promise<{ success: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.success) {
      onError(result.error ?? "That did not work.");
      return;
    }
    onChanged();
  }

  function openEditor(label: BoardLabelDTO | null) {
    setEditing(label);
    setDraftName(label?.name ?? "");
    setDraftColor(label?.color ?? BOARD_COLORS[1].id);
  }

  async function saveEditor() {
    if (editing) {
      await run(() =>
        updateBoardLabel({ labelId: editing.id, name: draftName, color: draftColor }),
      );
    } else {
      await run(() => createBoardLabel({ boardId, name: draftName, color: draftColor }));
    }
    setEditing(null);
    setDraftName("");
  }

  const [composing, setComposing] = useState(false);
  const inEditor = composing || editing !== null;

  // Once the card carries labels they become a section of their own, headed and
  // laid out in swatches. Before that there is only the one button to press.
  const carrying = applied.length > 0;

  return (
    <section className={cn(carrying && "space-y-2")}>
      {carrying && (
        <div className="flex items-center gap-2">
          <Tag className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          <h3 className="text-s font-medium text-foreground">Labels</h3>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {applied.map((label) => (
          <LabelChip key={label.id} label={label} size="lg" />
        ))}

        <Popover
          onOpenChange={(open) => {
            if (open) return;
            setComposing(false);
            setEditing(null);
            setQuery("");
          }}
        >
          <PopoverTrigger
            disabled={!canEdit}
            title={carrying ? "Add or edit labels" : undefined}
            aria-label={carrying ? "Add or edit labels" : undefined}
            className={cn(
              "flex items-center rounded-md border border-border bg-field text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60",
              carrying ? "size-8 justify-center" : "gap-1.5 px-2 py-1 text-s",
            )}
          >
            {carrying ? (
              <Plus className="size-4" />
            ) : (
              <>
                <Tag className="size-3.5" />
                Labels
                <ChevronDown className="size-3.5" />
              </>
            )}
          </PopoverTrigger>

          <PopoverContent align="start" className="w-72">
            {inEditor ? (
              <div className="space-y-3">
                <p className="text-s font-medium">
                  {editing ? "Edit label" : "New label"}
                </p>

                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Name (optional)"
                  className="h-8 w-full rounded-md border border-border bg-field px-2 text-s outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                />

                <div className="grid grid-cols-6 gap-1.5">
                  {BOARD_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      title={color.label}
                      aria-label={color.label}
                      onClick={() => setDraftColor(color.id)}
                      className={cn(
                        "grid h-7 place-items-center rounded text-background",
                        color.dot,
                        draftColor === color.id && "ring-2 ring-foreground ring-offset-1 ring-offset-popover",
                      )}
                    >
                      {draftColor === color.id && <Check className="size-3.5" />}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEditor()}
                    className="flex-1 rounded-md bg-primary px-3 py-1.5 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  {editing && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await run(() => deleteBoardLabel(editing.id));
                        setEditing(null);
                      }}
                      className="flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-s text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setEditing(null);
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-s text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>

                {editing && (
                  <p className="text-xs text-muted-foreground/70">
                    Deleting takes this label off every card that carries it.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-s font-medium">Labels</p>

                {labels.length > 4 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute inset-y-0 start-2 my-auto size-3.5 text-muted-foreground/60" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search labels…"
                      className="h-8 w-full rounded-md border border-border bg-field ps-7 pe-2 text-s outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                    />
                  </div>
                )}

                {labels.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground/70">
                    {canManage
                      ? "This board has no labels yet."
                      : "This board has no labels, and you cannot add one."}
                  </p>
                ) : shown.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground/70">
                    No label matches “{query}”.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {shown.map((label) => {
                      const checked = on.has(label.id);
                      return (
                        <li key={label.id} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={checked}
                            onClick={() =>
                              void run(() =>
                                toggleBoardCardLabel({
                                  cardId,
                                  labelId: label.id,
                                  on: !checked,
                                }),
                              )
                            }
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/50 disabled:opacity-50",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-4 shrink-0 place-items-center rounded border",
                                checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {checked && <Check className="size-3" />}
                            </span>
                            <span
                              className={cn(
                                "h-6 min-w-0 flex-1 rounded px-2 text-start text-xs leading-6 font-medium text-background",
                                boardColor(label.color).dot,
                              )}
                            >
                              {label.name}
                            </span>
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              aria-label={`Edit ${label.name || boardColor(label.color).label}`}
                              onClick={() => openEditor(label)}
                              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      openEditor(null);
                      setComposing(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-s text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                    Create a new label
                  </button>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
