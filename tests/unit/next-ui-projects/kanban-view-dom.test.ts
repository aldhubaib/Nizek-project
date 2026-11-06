// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * The Kanban page as used: a task opens to be edited, its ⋯ moves or deletes it without
 * opening it, a column's + starts a new task in that column, and each of those calls the right
 * action with the right arguments. Dragging is the library's and `dropTarget`'s business
 * (kanban-logic.test.ts).
 */

const h = React.createElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
Element.prototype.scrollIntoView = () => {};
// Radix opens menus on pointer events; jsdom has no PointerEvent, a MouseEvent by that name reaches React all the same
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

const card = (id: string, title: string, columnId: string, position: number, description: string | null = null) => ({
  id,
  cardNumber: Number(id.slice(1)),
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
    { id: "col1", name: "To do", color: "slate", position: 1 },
    { id: "col2", name: "In progress", color: "sky", position: 2 },
    { id: "col3", name: "Completed", color: "green", position: 3 },
  ],
  cardTypes: [{ id: "ct1", name: "Task", icon: "square", color: "slate", fields: [] }],
  labels: [],
  cards: [card("k1", "Set up the repo", "col1", 1000), card("k2", "Write the brief", "col1", 2000, "Two pages."), card("k3", "Design the login", "col2", 1000)],
  members: [],
  permissions: { isAdmin: true, canManageColumns: true, canManageTypes: true, canManageMembers: true, canCreateCard: true, canEditCard: true, canDeleteCard: true, canMoveCard: true, canComment: true },
  viewerId: "u1",
};

const action = () => ({ mutate: vi.fn(), isPending: false, variables: undefined });
const create = action();
const update = action();
const move = action();
const remove = action();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/next/projects/p1/kanban",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/next-ui/data/kanban", () => ({
  useBoard: () => ({ data: BOARD, isPending: false, error: null }),
  useCreateCard: () => create,
  useUpdateCard: () => update,
  useMoveCard: () => move,
  useDeleteCard: () => remove,
}));

const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));
const press = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    (el as HTMLElement).click();
  });
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const allByTestId = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const menuItem = (text: string) => [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")].find((el) => el.textContent?.trim() === text);
const dialog = () => byTestId("task-dialog");

async function mount() {
  const { KanbanView } = await import("@/next-ui/screens/projects/kanban-view");
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const errors: unknown[] = [];
  const root = createRoot(host, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
  await act(async () => root.render(h(TooltipProvider, null, h(KanbanView, { projectId: "p1", canEditSettings: true }))));
  await settle();
  return { host, root, errors, unmount: () => act(async () => root.unmount()) };
}

describe("the Kanban page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    for (const a of [create, update, move, remove]) a.mutate.mockClear();
  });

  it("opens a task to edit it and saves what changed, title and words", async () => {
    const { errors, unmount } = await mount();
    expect(allByTestId("kanban-column")).toHaveLength(3);
    expect(dialog()).toBeNull();

    await press(allByTestId("kanban-card")[1]);
    await settle();
    expect(dialog()).not.toBeNull();
    const title = byTestId("task-title") as HTMLInputElement;
    const words = byTestId("task-description") as HTMLTextAreaElement;
    expect(title.value).toBe("Write the brief");
    expect(words.value).toBe("Two pages.");
    expect(byTestId("task-column")?.textContent).toContain("To do");

    await type(title, "Write the brief for the client");
    await press(byTestId("task-save")!);
    expect(update.mutate).toHaveBeenCalledTimes(1);
    expect(update.mutate.mock.calls[0][0]).toEqual({ cardId: "k2", title: "Write the brief for the client" });
    expect(move.mutate).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    await unmount();
  });

  it("moves a task from its ⋯ to the end of another column, without opening it", async () => {
    const { errors, unmount } = await mount();
    const first = allByTestId("kanban-card")[0];
    const menu = first.querySelector<HTMLElement>('[data-testid="record-menu"]')!;
    await press(menu);
    await settle();
    expect(dialog()).toBeNull();
    const items = [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")].map((el) => el.textContent?.trim());
    expect(items).toEqual(["Edit", "Move to In progress", "Move to Completed", "Delete"]);

    await press(menuItem("Move to In progress")!);
    await settle();
    expect(move.mutate).toHaveBeenCalledTimes(1);
    // after the one card already there
    expect(move.mutate.mock.calls[0][0]).toEqual({ cardId: "k1", columnId: "col2", index: 1 });
    expect(dialog()).toBeNull();
    expect(errors).toEqual([]);
    await unmount();
  });

  it("deletes a task from its ⋯, and from the open task after a second press", async () => {
    const { errors, unmount } = await mount();
    const cards = allByTestId("kanban-card");
    await press(cards[2].querySelector<HTMLElement>('[data-testid="record-menu"]')!);
    await settle();
    await press(menuItem("Delete")!);
    await settle();
    expect(remove.mutate).toHaveBeenCalledTimes(1);
    expect(remove.mutate.mock.calls[0][0]).toBe("k3");

    await press(allByTestId("kanban-card")[0]);
    await settle();
    expect(dialog()).not.toBeNull();
    expect(byTestId("delete-confirm")).toBeNull();
    await press(byTestId("task-delete")!);
    await settle();
    expect(byTestId("delete-confirm")).not.toBeNull();
    expect(remove.mutate).toHaveBeenCalledTimes(1);
    await press(byTestId("task-delete")!);
    expect(remove.mutate).toHaveBeenCalledTimes(2);
    expect(remove.mutate.mock.calls[1][0]).toBe("k1");
    expect(errors).toEqual([]);
    await unmount();
  });

  it("starts a new task in the column whose + was pressed, and adds it with the board's one card type", async () => {
    const { errors, unmount } = await mount();
    await press(allByTestId("column-add")[2]);
    await settle();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("New task");
    expect(byTestId("task-column")?.textContent).toContain("Completed");
    // nothing to add until there is a title
    expect((byTestId("task-save") as HTMLButtonElement).disabled).toBe(true);
    await type(byTestId("task-title") as HTMLInputElement, "  Ship it  ");
    await type(byTestId("task-description") as HTMLTextAreaElement, "Tag the release.");
    expect((byTestId("task-save") as HTMLButtonElement).disabled).toBe(false);
    await press(byTestId("task-save")!);
    expect(create.mutate).toHaveBeenCalledTimes(1);
    expect(create.mutate.mock.calls[0][0]).toEqual({ boardId: "b1", columnId: "col3", cardTypeId: "ct1", title: "Ship it", description: "Tag the release." });
    expect(errors).toEqual([]);
    await unmount();
  });
});
