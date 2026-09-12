import { describe, it, expect } from "vitest";
import { dueState, fromDateInput, toDateInput } from "@/lib/board-dates";

const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime(); // 7 Sep 2026, midday local
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Midnight on a day, which is how a date-only due date is stored. */
function day(offsetDays: number): Date {
  const date = new Date(NOW);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
}

describe("dueState", () => {
  it("is nothing at all without a due date", () => {
    expect(dueState({ dueDate: null, dueDone: false }, NOW)).toBe(null);
  });

  it("reads done before it reads the clock", () => {
    expect(dueState({ dueDate: day(-30), dueDone: true }, NOW)).toBe("done");
  });

  it("calls a past day overdue", () => {
    expect(dueState({ dueDate: day(-1), dueDone: false }, NOW)).toBe("overdue");
  });

  it("does not call today overdue, however early the stored time", () => {
    // A date-only due date is midnight, which is behind us by midday. The day
    // it names has not run out, so the card is not late yet.
    expect(dueState({ dueDate: day(0), dueDone: false }, NOW)).toBe("soon");
  });

  it("calls the rest of today soon, and beyond that later", () => {
    expect(dueState({ dueDate: day(1), dueDone: false }, NOW)).toBe("later");
    expect(dueState({ dueDate: day(3), dueDone: false }, NOW)).toBe("later");
  });
});

describe("input conversion", () => {
  it("writes the local day, not the UTC one", () => {
    // Late evening local time is already tomorrow in UTC east of GMT, and
    // yesterday west of it. Either way the picker must show the local day.
    expect(toDateInput(new Date(2026, 8, 7, 23, 30))).toBe("2026-09-07");
  });

  it("pads single digits", () => {
    expect(toDateInput(new Date(2026, 0, 5, 9, 5))).toBe("2026-01-05");
  });

  it("is empty for no date", () => {
    expect(toDateInput(null)).toBe("");
  });

  it("round-trips a day, landing on local midnight", () => {
    const back = fromDateInput("2026-09-08");
    expect(back?.getFullYear()).toBe(2026);
    expect(back?.getMonth()).toBe(8);
    expect(back?.getDate()).toBe(8);
    expect(back?.getHours()).toBe(0);
    expect(back?.getMinutes()).toBe(0);
  });

  it("refuses an empty day", () => {
    expect(fromDateInput("")).toBe(null);
  });
});
