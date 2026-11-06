import { describe, expect, it } from "vitest";

import { cardsOf, dropTarget, movedBoard, type KanbanBoard } from "@/next-ui/data/kanban-logic";

/** A board of the simple kind, To do / In progress / Completed, with four tasks. */
const card = (id: string, columnId: string, position: number, title = id, description: string | null = null) => ({
  id,
  cardNumber: 1,
  title,
  description,
  columnId,
  cardTypeId: "ct1",
  position,
  assignee: null,
  commentCount: 0,
  isComplete: false,
  startDate: null,
  dueDate: null,
  dueDone: false,
  labelIds: [],
  updatedAt: new Date(0),
});

const BOARD = {
  id: "b1",
  name: "Board",
  enabled: true,
  columns: [
    { id: "todo", name: "To do", color: "slate", position: 1 },
    { id: "doing", name: "In progress", color: "sky", position: 2 },
    { id: "done", name: "Completed", color: "green", position: 3 },
  ],
  cardTypes: [{ id: "ct1", name: "Task", icon: "square", color: "slate", fields: [] }],
  labels: [],
  // out of order on purpose: the column sorts by position
  cards: [card("b", "todo", 2000, "Write the brief", "Two pages."), card("a", "todo", 1000, "Set up the repo"), card("c", "todo", 3000, "Design the login"), card("d", "doing", 1000, "Build the API")],
  members: [],
  permissions: { isAdmin: true, canManageColumns: true, canManageTypes: true, canManageMembers: true, canCreateCard: true, canEditCard: true, canDeleteCard: true, canMoveCard: true, canComment: true },
  viewerId: "u1",
} as unknown as KanbanBoard;

const order = (board: KanbanBoard, columnId: string) => cardsOf(board, columnId).map((c) => c.id);

describe("the Kanban's own arithmetic", () => {
  it("lists a column's cards by position, and finds them by title or words", () => {
    expect(order(BOARD, "todo")).toEqual(["a", "b", "c"]);
    expect(order(BOARD, "done")).toEqual([]);
    expect(cardsOf(BOARD, "todo", "brief").map((c) => c.id)).toEqual(["b"]);
    expect(cardsOf(BOARD, "todo", "two PAGES").map((c) => c.id)).toEqual(["b"]);
    expect(cardsOf(BOARD, "todo", "   ").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("knows where a drop lands: last on a column, in a card's place on a card, nowhere when nothing changes", () => {
    // onto another column: at its end
    expect(dropTarget(BOARD, "a", { columnId: "doing" })).toEqual({ columnId: "doing", index: 1 });
    expect(dropTarget(BOARD, "a", { columnId: "done" })).toEqual({ columnId: "done", index: 0 });
    // onto a card of another column: that card's place
    expect(dropTarget(BOARD, "a", { columnId: "doing", cardId: "d" })).toEqual({ columnId: "doing", index: 0 });
    // within its column: before the card it is over, counted without itself
    expect(dropTarget(BOARD, "a", { columnId: "todo", cardId: "c" })).toEqual({ columnId: "todo", index: 1 });
    expect(dropTarget(BOARD, "c", { columnId: "todo", cardId: "a" })).toEqual({ columnId: "todo", index: 0 });
    // nothing to do: its own column's end, its own place, itself, a card that is not there
    expect(dropTarget(BOARD, "c", { columnId: "todo" })).toBeNull();
    expect(dropTarget(BOARD, "a", { columnId: "todo", cardId: "a" })).toBeNull();
    expect(dropTarget(BOARD, "b", { columnId: "todo", cardId: "c" })).toBeNull();
    expect(dropTarget(BOARD, "a", { columnId: "doing", cardId: "zz" })).toBeNull();
    expect(dropTarget(BOARD, "zz", { columnId: "doing" })).toBeNull();
  });

  it("shows the move at once: the card leaves its column, joins the other at the index, positions renumbered", () => {
    const moved = movedBoard(BOARD, { cardId: "b", columnId: "doing", index: 0 });
    expect(order(moved, "todo")).toEqual(["a", "c"]);
    expect(order(moved, "doing")).toEqual(["b", "d"]);
    expect(moved.cards.find((c) => c.id === "b")).toMatchObject({ columnId: "doing", position: 1 });
    expect(moved.cards.find((c) => c.id === "d")).toMatchObject({ columnId: "doing", position: 2 });
    // the other columns' cards are untouched, and the input board is not changed
    expect(moved.cards.find((c) => c.id === "a")).toBe(BOARD.cards.find((c) => c.id === "a"));
    expect(order(BOARD, "todo")).toEqual(["a", "b", "c"]);

    // within a column, and an index past the end lands last
    expect(order(movedBoard(BOARD, { cardId: "c", columnId: "todo", index: 0 }), "todo")).toEqual(["c", "a", "b"]);
    expect(order(movedBoard(BOARD, { cardId: "a", columnId: "todo", index: 99 }), "todo")).toEqual(["b", "c", "a"]);
    expect(movedBoard(BOARD, { cardId: "zz", columnId: "todo", index: 0 })).toBe(BOARD);

    // a drop and its picture agree
    const target = dropTarget(BOARD, "a", { columnId: "doing", cardId: "d" })!;
    expect(order(movedBoard(BOARD, { cardId: "a", ...target }), "doing")).toEqual(["a", "d"]);
  });
});
