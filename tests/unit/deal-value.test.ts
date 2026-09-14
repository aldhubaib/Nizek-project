import { describe, expect, it } from "vitest";
import { formatDealValue } from "../../src/lib/deal-value";

describe("formatDealValue", () => {
  it("returns empty for a missing value", () => {
    expect(formatDealValue(null)).toBe("");
    expect(formatDealValue(undefined)).toBe("");
    expect(formatDealValue("")).toBe("");
  });

  it("groups thousands and drops trailing zeros", () => {
    expect(formatDealValue("12500")).toBe("12,500");
    expect(formatDealValue("12500.5")).toBe("12,500.5");
    expect(formatDealValue("1.250")).toBe("1.25");
  });

  it("shows an unparseable string as itself rather than blank", () => {
    expect(formatDealValue("not-a-number")).toBe("not-a-number");
  });
});
