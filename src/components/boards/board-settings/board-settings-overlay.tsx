"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ColumnManager } from "./column-manager";
import { CardTypeManager } from "./card-type-manager";
import { RolesManager } from "./roles-manager";
import type { BoardDTO } from "@/actions/board";

/**
 * Everything a board's admin can change, in one dialog.
 *
 * Which panels appear follows the caller's permissions, and each panel's
 * actions check the same permission again server-side — hiding a tab is a
 * courtesy, not the rule.
 */
export function BoardSettingsOverlay({
  board,
  onClose,
  onChanged,
}: {
  board: BoardDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const panels = [
    {
      id: "columns",
      label: "Columns",
      allowed: board.permissions.isAdmin || board.permissions.canManageColumns,
    },
    {
      id: "types",
      label: "Card types",
      allowed: board.permissions.isAdmin || board.permissions.canManageTypes,
    },
    {
      id: "roles",
      label: "Roles & members",
      allowed: board.permissions.isAdmin || board.permissions.canManageMembers,
    },
  ].filter((panel) => panel.allowed);

  const [active, setActive] = useState(panels[0]?.id ?? "columns");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Board settings</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="flex-1 text-s text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="text-destructive/60 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-1 border-b border-border">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActive(panel.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-s font-medium transition-colors",
                active === panel.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {panel.label}
            </button>
          ))}
        </div>

        {active === "columns" && (
          <ColumnManager
            boardId={board.id}
            columns={board.columns}
            onChanged={onChanged}
            onError={setError}
          />
        )}

        {active === "types" && (
          <CardTypeManager
            boardId={board.id}
            cardTypes={board.cardTypes}
            onChanged={onChanged}
            onError={setError}
          />
        )}

        {active === "roles" && <RolesManager boardId={board.id} onError={setError} />}
      </DialogContent>
    </Dialog>
  );
}
