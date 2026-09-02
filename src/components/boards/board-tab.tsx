"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2, X } from "lucide-react";
import { getBoard, type BoardDTO } from "@/actions/board";
import { BoardCanvas } from "./board-canvas";
import { CardDetailPanel } from "./card-detail-panel";
import { BoardSettingsOverlay } from "./board-settings/board-settings-overlay";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * The board, loaded when its tab is opened.
 *
 * Follows the pattern the sprint and notes tabs already use on the project
 * page: the tab fetches its own data on first activation rather than the page
 * loading everything up front, so a project that never opens its board pays
 * nothing for having one.
 */
export function BoardTab({ projectId }: { projectId: string }) {
  const [board, setBoard] = useState<BoardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await getBoard(projectId);
    setBoard(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="grid flex-1 place-items-center py-16">
        <p className="text-s text-muted-foreground">
          This board is not available to you.
        </p>
      </div>
    );
  }

  const canConfigure =
    board.permissions.isAdmin ||
    board.permissions.canManageColumns ||
    board.permissions.canManageTypes ||
    board.permissions.canManageMembers;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {error && (
        <div className="mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
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

      {/* Into the shell's single ⋮ rather than a button of its own, alongside
          the project's own Settings. Registered from here, so it appears only
          while the board tab is open and leaves with it. Ordered just above
          project settings, the item it is most easily confused with. */}
      {canConfigure && (
        <PageOverflowItems id="board-settings" order={90}>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            <span className="flex-1">Board settings</span>
          </DropdownMenuItem>
        </PageOverflowItems>
      )}

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <BoardCanvas
          boardId={board.id}
          columns={board.columns}
          cardTypes={board.cardTypes}
          cards={board.cards}
          permissions={board.permissions}
          onOpenCard={setOpenCardId}
          onError={setError}
          onReload={() => void reload()}
        />
      </div>

      {openCardId && (
        <CardDetailPanel
          cardId={openCardId}
          cardTypes={board.cardTypes}
          members={board.members}
          permissions={board.permissions}
          currentUserId={board.viewerId}
          onClose={() => setOpenCardId(null)}
          onChanged={() => void reload()}
          onError={setError}
        />
      )}

      {settingsOpen && (
        <BoardSettingsOverlay
          board={board}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}
