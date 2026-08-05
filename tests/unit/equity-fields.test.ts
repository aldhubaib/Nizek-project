import { describe, it, expect } from "vitest";
import {
  evaluateFormula,
  formatMetricValue,
  formulaLabel,
  isDateMetric,
  isFieldAnswered,
  isFormulaMetric,
} from "@/lib/equity-math";

describe("evaluateFormula", () => {
  it("works the four operations out", () => {
    expect(evaluateFormula("ADD", 2, 3)).toBe(5);
    expect(evaluateFormula("SUBTRACT", 20_000, 40)).toBe(19_960);
    expect(evaluateFormula("MULTIPLY", 4, 2.5)).toBe(10);
    expect(evaluateFormula("DIVIDE", 200_000, 2_000)).toBe(100);
  });

  it("has no answer when an operand wasn't reported", () => {
    expect(evaluateFormula("SUBTRACT", null, 40)).toBeNull();
    expect(evaluateFormula("SUBTRACT", 40, undefined)).toBeNull();
  });

  // A company that isn't burning has unbounded runway, which is not a number
  // and must never reach the UI as Infinity.
  it("refuses to divide by nothing rather than returning Infinity", () => {
    expect(evaluateFormula("DIVIDE", 200_000, 0)).toBeNull();
  });

  it("has no answer for an operation it doesn't know", () => {
    expect(evaluateFormula(null, 2, 3)).toBeNull();
    expect(evaluateFormula("POWER", 2, 3)).toBeNull();
  });
});

describe("formulaLabel", () => {
  it("reads as the sum it stands for", () => {
    expect(formulaLabel("SUBTRACT", "Revenue", "Cost")).toBe("Revenue − Cost");
    expect(formulaLabel("DIVIDE", "Cash in bank", "Burn")).toBe(
      "Cash in bank ÷ Burn",
    );
  });

  it("says nothing while an operand is still unpicked", () => {
    expect(formulaLabel("SUBTRACT", "Revenue", null)).toBeNull();
    expect(formulaLabel(null, "Revenue", "Cost")).toBeNull();
  });
});

describe("field types", () => {
  it("tells a date and a calculation apart from a plain figure", () => {
    expect(isDateMetric("DATE")).toBe(true);
    expect(isDateMetric("NUMBER")).toBe(false);
    expect(isFormulaMetric("FORMULA")).toBe(true);
    expect(isFormulaMetric("PERCENT")).toBe(false);
  });

  it("writes a calculated figure out with its unit, like any other", () => {
    expect(
      formatMetricValue({ type: "FORMULA", unit: "KWD" }, { numberValue: 19_960 }),
    ).toBe("19,960 KWD");
  });

  it("writes an unreported figure as a dash rather than a zero", () => {
    expect(
      formatMetricValue({ type: "NUMBER", unit: "KWD" }, { numberValue: null }),
    ).toBe("—");
  });
});

describe("isFieldAnswered", () => {
  // The distinction the required rule rests on: a quarter that took nothing in
  // has reported its revenue, and a quarter nobody filled in has not.
  it("counts zero as an answer and blank as none", () => {
    expect(isFieldAnswered({ type: "NUMBER" }, { numberValue: 0 })).toBe(true);
    expect(isFieldAnswered({ type: "NUMBER" }, { numberValue: null })).toBe(false);
    expect(isFieldAnswered({ type: "PERCENT" }, { numberValue: 0 })).toBe(true);
  });

  it("has nothing to read when the field was left off the report", () => {
    expect(isFieldAnswered({ type: "NUMBER" }, undefined)).toBe(false);
    expect(isFieldAnswered({ type: "NUMBER" }, null)).toBe(false);
  });

  it("reads a date field's answer from the date, not the figure", () => {
    expect(isFieldAnswered({ type: "DATE" }, { dateValue: "2026-08-04" })).toBe(
      true,
    );
    expect(isFieldAnswered({ type: "DATE" }, { dateValue: "" })).toBe(false);
    expect(isFieldAnswered({ type: "DATE" }, { numberValue: 0 })).toBe(false);
  });
});
