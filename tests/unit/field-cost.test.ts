import { describe, expect, it } from "vitest";
import {
  costFieldIsFilled,
  formatCostField,
  parseCostAmount,
  parseCostRows,
  stringifyCostRows,
  sumCostRows,
} from "../../src/lib/fields/cost";

describe("cost field", () => {
  it("parses and sums rows", () => {
    const raw = stringifyCostRows([
      { title: "Venue", cost: "1,250" },
      { title: "Food", cost: "800.5" },
    ]);
    const rows = parseCostRows(raw);
    expect(rows).toHaveLength(2);
    expect(parseCostAmount("1,250")).toBe(1250);
    expect(sumCostRows(rows)).toBe(2050.5);
    expect(formatCostField(raw)).toMatch(/^2 items · /);
  });

  it("needs a titled amount to count as filled", () => {
    expect(costFieldIsFilled("")).toBe(false);
    expect(
      costFieldIsFilled(stringifyCostRows([{ title: "Venue", cost: "" }])),
    ).toBe(false);
    expect(
      costFieldIsFilled(stringifyCostRows([{ title: "Venue", cost: "10" }])),
    ).toBe(true);
  });

  it("keeps a blank extra row when adding", () => {
    const raw = stringifyCostRows([
      { title: "Venue", cost: "10" },
      { title: "", cost: "" },
    ]);
    expect(parseCostRows(raw)).toHaveLength(2);
  });
});
