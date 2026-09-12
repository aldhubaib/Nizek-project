"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Settings2, SlidersHorizontal, X } from "lucide-react";
import { getBoard, type BoardDTO } from "@/actions/board";
import { BoardCanvas } from "./board-canvas";
import { CardDetailPanel } from "./card-detail-panel";
import { BoardFilterPanel } from "./board-filter-panel";
import { BoardSettingsOverlay } from "./board-settings/board-settings-overlay";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { PageHeaderActions } from "@/components/page-header-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  EMPTY_FILTER,
  activeFilterCount,
  cardMatchesFilter,
  isFilterActive,
  type BoardFilter,
} from "@/lib/board-filter";

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
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);

  const reload = useCallback(async () => {
    const data = await getBoard(projectId);
    setBoard(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Counted here rather than in the canvas so the panel can report the effect
  // of a choice at the moment it is made.
  const matchCount = useMemo(() => {
    if (!board) return 0;
    if (!isFilterActive(filter)) return board.cards.length;
    const now = Date.now();
    return board.cards.filter((card) => cardMatchesFilter(card, filter, now)).length;
  }, [board, filter]);

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

  const filterCount = activeFilterCount(filter);

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

      {/* Into the shell's own top-right corner, beside the ⋮, rather than a
          strip of its own above the columns — the board is already short of
          vertical room and every column would lose that height. */}
      <PageHeaderActions>
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-s font-medium transition-colors",
              filterCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Filter
            {filterCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-xs">
                {filterCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <BoardFilterPanel
              filter={filter}
              onChange={setFilter}
              cardTypes={board.cardTypes}
              labels={board.labels}
              members={board.members}
              viewerId={board.viewerId}
              matchCount={matchCount}
              totalCount={board.cards.length}
            />
          </PopoverContent>
        </Popover>
      </PageHeaderActions>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <BoardCanvas
          boardId={board.id}
          columns={board.columns}
          cardTypes={board.cardTypes}
          labels={board.labels}
          cards={board.cards}
          permissions={board.permissions}
          filter={filter}
          onOpenCard={setOpenCardId}
          onError={setError}
          onReload={() => void reload()}
        />
      </div>

      {openCardId && (
        <CardDetailPanel
          cardId={openCardId}
          boardId={board.id}
          cardTypes={board.cardTypes}
          labels={board.labels}
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
