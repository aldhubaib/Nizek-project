import { describe, expect, it } from "vitest";
import { addWorkingDays, formatWorkingDays, parseWorkingDays, parseDateInputValue, startOfLocalDay, toDateInputValue } from "@/lib/working-days";

describe("parseWorkingDays", () => {
  it("treats empty as unset", () => {
    expect(parseWorkingDays(null)).toBeNull();
    expect(parseWorkingDays("")).toBeNull();
    expect(parseWorkingDays(undefined)).toBeNull();
  });

  it("accepts whole numbers of at least 1", () => {
    expect(parseWorkingDays(1)).toBe(1);
    expect(parseWorkingDays("12")).toBe(12);
  });

  it("rejects fractions and zero", () => {
    expect(() => parseWorkingDays(0)).toThrow(/whole number/);
    expect(() => parseWorkingDays(1.5)).toThrow(/whole number/);
    expect(() => parseWorkingDays("nope")).toThrow(/whole number/);
  });
});

describe("formatWorkingDays", () => {
  it("pluralizes efforts", () => {
    expect(formatWorkingDays(1)).toBe("1 effort");
    expect(formatWorkingDays(3)).toBe("3 efforts");
  });
});

describe("addWorkingDays", () => {
  it("skips Friday and Saturday", () => {
    // Friday 14 Aug 2026 + 1 working day → Sunday 16 Aug
    const due = addWorkingDays(new Date(2026, 7, 14, 10), 1);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(7);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(17);
  });

  it("counts Sunday–Thursday as working days", () => {
    // Sunday 16 Aug 2026 + 5 working days → Sunday 23 Aug
    const due = addWorkingDays(new Date(2026, 7, 16, 9), 5);
    expect(due.getDate()).toBe(23);
    expect(due.getMonth()).toBe(7);
  });
});

describe("toDateInputValue", () => {
  it("formats local calendar date", () => {
    expect(toDateInputValue(new Date(2026, 7, 21, 17))).toBe("2026-08-21");
  });
});

describe("startOfLocalDay", () => {
  it("zeros the clock on the same calendar day", () => {
    const start = startOfLocalDay(new Date(2026, 7, 17, 22, 45));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(17);
    expect(start.getHours()).toBe(0);
  });
});

describe("parseDateInputValue", () => {
  it("reads an input date as local midnight", () => {
    const d = parseDateInputValue("2026-08-17");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(0);
  });
});
