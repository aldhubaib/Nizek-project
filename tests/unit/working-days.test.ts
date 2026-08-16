import { describe, expect, it } from "vitest";
import { formatWorkingDays, parseWorkingDays } from "@/lib/working-days";

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
  it("pluralizes", () => {
    expect(formatWorkingDays(1)).toBe("1 working day");
    expect(formatWorkingDays(3)).toBe("3 working days");
  });
});
