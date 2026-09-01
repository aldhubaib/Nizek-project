"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardColor, DEFAULT_BOARD_COLOR } from "@/lib/board-palette";
import {
  createBoardColumn,
  deleteBoardColumn,
  reorderBoardColumns,
  updateBoardColumn,
} from "@/actions/board";
import { ColorPicker, InlineName } from "./settings-controls";
import type { BoardColumnDTO } from "@/actions/board";

interface Props {
  boardId: string;
  columns: BoardColumnDTO[];
  onChanged: () => void;
  onError: (message: string) => void;
}

/**
 * The columns, in the order they appear on the board.
 *
 * Reordering is a pair of arrows rather than a drag. The board itself is the
 * place dragging belongs, and a settings list that can be nudged one step is
 * both easier to hit and easier to undo.
 */
export function ColumnManager({ boardId, columns, onChanged, onError }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_BOARD_COLOR);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= columns.length) return;
    const ids = columns.map((column) => column.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await run(() => reorderBoardColumns({ boardId, orderedIds: ids }));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {columns.map((column, index) => {
          const palette = boardColor(column.color);
          const isEditing = editingId === column.id;
          return (
            <div
              key={column.id}
              className="rounded-lg border border-border bg-field px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", palette.dot)} />
                <InlineName
                  value={column.name}
                  onSave={(next) =>
                    void run(() => updateBoardColumn({ columnId: column.id, name: next }))
                  }
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : column.id)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Colour
                </button>
                <button
                  type="button"
                  disabled={index === 0 || busy}
                  onClick={() => void move(index, -1)}
                  aria-label="Move up"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === columns.length - 1 || busy}
                  onClick={() => void move(index, 1)}
                  aria-label="Move down"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => deleteBoardColumn(column.id))}
                  aria-label={`Delete ${column.name}`}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {isEditing && (
                <div className="mt-2 border-t border-border/50 pt-2">
                  <ColorPicker
                    value={column.color}
                    onChange={(next) =>
                      void run(() => updateBoardColumn({ columnId: column.id, color: next }))
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="space-y-2 rounded-lg border border-border bg-field p-3">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Column name"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-s outline-none"
          />
          <ColorPicker value={color} onChange={setColor} />
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
              disabled={!name.trim() || busy}
              onClick={async () => {
                const ok = await run(() =>
                  createBoardColumn({ boardId, name: name.trim(), color }),
                );
                if (ok) {
                  setName("");
                  setColor(DEFAULT_BOARD_COLOR);
                  setAdding(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-s font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3 animate-spin" />}
              Add column
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
          Add a column
        </button>
      )}
    </div>
  );
}
