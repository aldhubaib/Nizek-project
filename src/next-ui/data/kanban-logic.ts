import type { BoardCardDTO, BoardColumnDTO, BoardDTO } from "@/actions/board";

/**
 * What the Kanban works out on its own, without the server: which cards a column holds and in
 * what order, where a dropped card lands, and the board as it looks once a card has moved (shown
 * before the server answers). Pure, so the page and the hooks share it and the tests reach it.
 */

export type KanbanBoard = BoardDTO;
export type KanbanColumn = BoardColumnDTO;
export type KanbanCard = BoardCardDTO;

/** The cards of a column in their order; `search` keeps those whose title or words contain it. */
export function cardsOf(board: KanbanBoard, columnId: string, search = ""): KanbanCard[] {
  const q = search.trim().toLowerCase();
  return board.cards
    .filter((c) => c.columnId === columnId && (!q || c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)))
    .sort((a, b) => a.position - b.position);
}

/**
 * Where a dropped card lands: the column, and its place among that column's other cards. On a
 * column itself it goes last; on a card it takes that card's place, pushing it down. `null` when
 * the drop changes nothing (its own column's end, its own place, an unknown card).
 */
export function dropTarget(board: KanbanBoard, cardId: string, over: { columnId: string; cardId?: string }): { columnId: string; index: number } | null {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const others = cardsOf(board, over.columnId).filter((c) => c.id !== cardId);
  if (!over.cardId || over.cardId === cardId) {
    if (card.columnId === over.columnId) return null;
    return { columnId: over.columnId, index: others.length };
  }
  const index = others.findIndex((c) => c.id === over.cardId);
  if (index < 0) return null;
  if (card.columnId === over.columnId && cardsOf(board, over.columnId).findIndex((c) => c.id === cardId) === index) return null;
  return { columnId: over.columnId, index };
}

/** The board with one card moved: out of its column, into `columnId` at `index`, positions renumbered. */
export function movedBoard(board: KanbanBoard, move: { cardId: string; columnId: string; index: number }): KanbanBoard {
  const card = board.cards.find((c) => c.id === move.cardId);
  if (!card) return board;
  const rest = board.cards.filter((c) => c.id !== move.cardId);
  const target = rest.filter((c) => c.columnId === move.columnId).sort((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(move.index, target.length));
  target.splice(at, 0, { ...card, columnId: move.columnId });
  const renumbered = new Map(target.map((c, i) => [c.id, i + 1]));
  return {
    ...board,
    cards: [...rest.filter((c) => c.columnId !== move.columnId), ...target].map((c) =>
      renumbered.has(c.id) ? { ...c, columnId: move.columnId, position: renumbered.get(c.id)! } : c,
    ),
  };
}
