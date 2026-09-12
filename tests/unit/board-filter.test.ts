import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTER,
  UNASSIGNED,
  UNLABELLED,
  activeFilterCount,
  cardMatchesFilter,
  isFilterActive,
  toggleChoice,
  type BoardFilter,
} from "@/lib/board-filter";
import type { BoardCardDTO } from "@/actions/board";

const NOW = new Date("2026-09-07T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(overrides: Partial<BoardCardDTO> = {}): BoardCardDTO {
  return {
    id: "c1",
    cardNumber: 7,
    title: "Fix the login redirect",
    description: null,
    columnId: "col1",
    cardTypeId: "type-bug",
    position: 1,
    assignee: null,
    commentCount: 0,
    isComplete: false,
    startDate: null,
    dueDate: null,
    dueDone: false,
    labelIds: [],
    updatedAt: new Date(NOW - DAY),
    ...overrides,
  };
}

function filter(overrides: Partial<BoardFilter> = {}): BoardFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe("isFilterActive", () => {
  it("is inert with nothing chosen", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it("does not count the display-only options", () => {
    expect(isFilterActive(filter({ collapseEmpty: true, mode: "all" }))).toBe(false);
  });

  it("ignores a keyword of only whitespace", () => {
    expect(isFilterActive(filter({ keyword: "   " }))).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("adds up every chosen option", () => {
    const f = filter({
      keyword: "login",
      assignees: ["u1", UNASSIGNED],
      statuses: ["complete"],
    });
    expect(activeFilterCount(f)).toBe(4);
  });
});

describe("cardMatchesFilter", () => {
  it("keeps everything when nothing is chosen", () => {
    expect(cardMatchesFilter(card(), EMPTY_FILTER, NOW)).toBe(true);
  });

  it("searches the title case-insensitively", () => {
    expect(cardMatchesFilter(card(), filter({ keyword: "LOGIN" }), NOW)).toBe(true);
    expect(cardMatchesFilter(card(), filter({ keyword: "logout" }), NOW)).toBe(false);
  });

  it("searches the description and the assignee's name", () => {
    const c = card({
      description: "Safari only",
      assignee: { id: "u1", name: "Layla", imageUrl: null },
    });
    expect(cardMatchesFilter(c, filter({ keyword: "safari" }), NOW)).toBe(true);
    expect(cardMatchesFilter(c, filter({ keyword: "layla" }), NOW)).toBe(true);
  });

  it("finds a card by number, with or without the hash", () => {
    expect(cardMatchesFilter(card(), filter({ keyword: "#7" }), NOW)).toBe(true);
    expect(cardMatchesFilter(card(), filter({ keyword: "7" }), NOW)).toBe(true);
  });

  it("matches an unassigned card against the unassigned choice", () => {
    expect(cardMatchesFilter(card(), filter({ assignees: [UNASSIGNED] }), NOW)).toBe(true);
    expect(cardMatchesFilter(card(), filter({ assignees: ["u1"] }), NOW)).toBe(false);
  });

  it("treats choices within one section as alternatives", () => {
    const f = filter({ assignees: ["u1", "u2"] });
    const mine = card({ assignee: { id: "u2", name: "Sara", imageUrl: null } });
    expect(cardMatchesFilter(mine, f, NOW)).toBe(true);
  });

  it("reads status from whether required fields are answered", () => {
    expect(cardMatchesFilter(card(), filter({ statuses: ["incomplete"] }), NOW)).toBe(true);
    expect(cardMatchesFilter(card(), filter({ statuses: ["complete"] }), NOW)).toBe(false);
    const done = card({ isComplete: true });
    expect(cardMatchesFilter(done, filter({ statuses: ["complete"] }), NOW)).toBe(true);
  });

  describe("activity windows", () => {
    it("counts a card touched yesterday as active in the last week", () => {
      expect(cardMatchesFilter(card(), filter({ activity: ["week"] }), NOW)).toBe(true);
    });

    it("excludes an older card from a shorter window", () => {
      const old = card({ updatedAt: new Date(NOW - 20 * DAY) });
      expect(cardMatchesFilter(old, filter({ activity: ["week"] }), NOW)).toBe(false);
      expect(cardMatchesFilter(old, filter({ activity: ["four-weeks"] }), NOW)).toBe(true);
    });

    it("is the other way round for stale", () => {
      const stale = card({ updatedAt: new Date(NOW - 40 * DAY) });
      expect(cardMatchesFilter(stale, filter({ activity: ["stale"] }), NOW)).toBe(true);
      expect(cardMatchesFilter(card(), filter({ activity: ["stale"] }), NOW)).toBe(false);
    });
  });

  describe("labels", () => {
    const tagged = card({ labelIds: ["red", "urgent"] });

    it("finds a card by any one of its labels", () => {
      expect(cardMatchesFilter(tagged, filter({ labels: ["urgent"] }), NOW)).toBe(true);
      expect(cardMatchesFilter(tagged, filter({ labels: ["blue"] }), NOW)).toBe(false);
    });

    it("finds cards carrying none", () => {
      expect(cardMatchesFilter(card(), filter({ labels: [UNLABELLED] }), NOW)).toBe(true);
      expect(cardMatchesFilter(tagged, filter({ labels: [UNLABELLED] }), NOW)).toBe(false);
    });

    it("combines No labels with a specific one as alternatives", () => {
      const f = filter({ labels: [UNLABELLED, "urgent"] });
      expect(cardMatchesFilter(card(), f, NOW)).toBe(true);
      expect(cardMatchesFilter(tagged, f, NOW)).toBe(true);
      expect(cardMatchesFilter(card({ labelIds: ["red"] }), f, NOW)).toBe(false);
    });
  });

  describe("due dates", () => {
    const overdue = card({ dueDate: new Date(NOW - DAY) });
    const tomorrow = card({ dueDate: new Date(NOW + 12 * 60 * 60 * 1000) });
    const nextMonth = card({ dueDate: new Date(NOW + 20 * DAY) });

    it("finds cards with no due date", () => {
      expect(cardMatchesFilter(card(), filter({ due: ["none"] }), NOW)).toBe(true);
      expect(cardMatchesFilter(overdue, filter({ due: ["none"] }), NOW)).toBe(false);
    });

    it("finds overdue cards", () => {
      expect(cardMatchesFilter(overdue, filter({ due: ["overdue"] }), NOW)).toBe(true);
    });

    it("does not call a ticked-off card overdue", () => {
      const done = card({ dueDate: new Date(NOW - DAY), dueDone: true });
      expect(cardMatchesFilter(done, filter({ due: ["overdue"] }), NOW)).toBe(false);
      expect(cardMatchesFilter(done, filter({ due: ["done"] }), NOW)).toBe(true);
    });

    it("keeps the horizons forward-looking, so overdue is not swept in", () => {
      expect(cardMatchesFilter(overdue, filter({ due: ["week"] }), NOW)).toBe(false);
      expect(cardMatchesFilter(tomorrow, filter({ due: ["week"] }), NOW)).toBe(true);
    });

    it("nests the horizons", () => {
      expect(cardMatchesFilter(tomorrow, filter({ due: ["day"] }), NOW)).toBe(true);
      expect(cardMatchesFilter(nextMonth, filter({ due: ["day"] }), NOW)).toBe(false);
      expect(cardMatchesFilter(nextMonth, filter({ due: ["month"] }), NOW)).toBe(true);
    });
  });

  describe("match mode", () => {
    const mismatched = filter({
      assignees: ["someone-else"],
      statuses: ["incomplete"],
    });

    it("any: one satisfied section is enough", () => {
      expect(cardMatchesFilter(card(), { ...mismatched, mode: "any" }, NOW)).toBe(true);
    });

    it("all: every section with a choice must be satisfied", () => {
      expect(cardMatchesFilter(card(), { ...mismatched, mode: "all" }, NOW)).toBe(false);
    });
  });

  it("narrows by keyword whatever the mode says", () => {
    // The keyword is a search box, not a section: widening the results as you
    // type into it would be a surprise.
    const f = filter({ keyword: "nothing matches this", statuses: ["incomplete"], mode: "any" });
    expect(cardMatchesFilter(card(), f, NOW)).toBe(false);
  });
});

describe("toggleChoice", () => {
  it("adds what is absent and removes what is present", () => {
    expect(toggleChoice([], "a")).toEqual(["a"]);
    expect(toggleChoice(["a", "b"], "a")).toEqual(["b"]);
  });
});
