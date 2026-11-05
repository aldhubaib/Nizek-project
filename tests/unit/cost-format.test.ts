import { describe, expect, it } from "vitest";
import { formatAmount } from "../../src/lib/fields/cost";

describe("formatAmount", () => {
  it("returns empty for a missing value", () => {
    expect(formatAmount(null)).toBe("");
    expect(formatAmount(undefined)).toBe("");
    expect(formatAmount("")).toBe("");
  });

  it("groups thousands and drops trailing zeros", () => {
    expect(formatAmount("12500")).toBe("12,500");
    expect(formatAmount("12500.5")).toBe("12,500.5");
    expect(formatAmount("1.250")).toBe("1.25");
  });

  it("shows an unparseable string as itself rather than blank", () => {
    expect(formatAmount("not-a-number")).toBe("not-a-number");
  });
});
