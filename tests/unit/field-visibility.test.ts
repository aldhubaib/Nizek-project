import { describe, expect, it } from "vitest";
import {
  fieldAppliesOnForm,
  fieldIsLogicallyVisible,
  parseFieldAnswers,
  parseFieldVisibility,
  stringifyFieldVisibility,
} from "../../src/lib/fields/visibility";

describe("parseFieldAnswers", () => {
  it("reads a pick list string", () => {
    expect(parseFieldAnswers("Company")).toEqual(["Company"]);
  });

  it("reads a multi-select JSON array", () => {
    expect(parseFieldAnswers('["Company","Personal"]')).toEqual([
      "Company",
      "Personal",
    ]);
  });

  it("reads a yes/no checkbox", () => {
    expect(parseFieldAnswers("true")).toEqual(["true"]);
  });
});

describe("fieldIsLogicallyVisible", () => {
  const company = {
    visibility: {
      dependsOn: "type",
      values: ["Company"],
    },
  };

  it("shows when there is no rule", () => {
    expect(fieldIsLogicallyVisible({}, { type: "Personal" })).toBe(true);
  });

  it("shows the company field when type is Company", () => {
    expect(fieldIsLogicallyVisible(company, { type: "Company" })).toBe(true);
  });

  it("hides the company field when type is Personal", () => {
    expect(fieldIsLogicallyVisible(company, { type: "Personal" })).toBe(false);
  });

  it("stays visible while the rule has no values yet", () => {
    expect(
      fieldIsLogicallyVisible(
        { visibility: { dependsOn: "type", values: [] } },
        { type: "Personal" },
      ),
    ).toBe(true);
  });

  it("stays visible if the controlling field was deleted", () => {
    expect(fieldIsLogicallyVisible(company, { type: "Personal" }, ["other"])).toBe(
      true,
    );
  });
});

describe("fieldAppliesOnForm", () => {
  it("respects show-on and the pick list", () => {
    const field = {
      showOn: "both",
      visibility: stringifyFieldVisibility({
        dependsOn: "type",
        values: ["Company"],
      }),
    };
    expect(fieldAppliesOnForm(field, "create", { type: "Company" })).toBe(true);
    expect(fieldAppliesOnForm(field, "create", { type: "Personal" })).toBe(false);
    expect(
      fieldAppliesOnForm({ ...field, showOn: "edit" }, "create", {
        type: "Company",
      }),
    ).toBe(false);
  });
});

describe("parseFieldVisibility", () => {
  it("round-trips a rule", () => {
    const rule = { dependsOn: "type", values: ["Company"] };
    expect(parseFieldVisibility(stringifyFieldVisibility(rule))).toEqual(rule);
  });
});
