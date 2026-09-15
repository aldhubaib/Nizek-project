import { describe, expect, it } from "vitest";
import {
  clearHiddenFieldValues,
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

describe("clearHiddenFieldValues", () => {
  const organizer = {
    id: "organizer",
    visibility: { dependsOn: "type", values: ["Company"] },
  };

  it("clears a hidden field and keeps a visible one", () => {
    expect(
      clearHiddenFieldValues(
        [{ id: "type" }, organizer, { id: "contact" }],
        {
          type: "Personal",
          organizer: '["co_1"]',
          contact: '["c_1"]',
        },
      ),
    ).toEqual({
      type: "Personal",
      organizer: "",
      contact: '["c_1"]',
    });
  });

  it("keeps the answer while the pick list still matches", () => {
    expect(
      clearHiddenFieldValues([{ id: "type" }, organizer], {
        type: "Company",
        organizer: '["co_1"]',
      }),
    ).toEqual({
      type: "Company",
      organizer: '["co_1"]',
    });
  });

  it("clears nested fields after their parent is wiped", () => {
    expect(
      clearHiddenFieldValues(
        [
          { id: "kind" },
          {
            id: "mid",
            visibility: { dependsOn: "kind", values: ["Yes"] },
          },
          {
            id: "leaf",
            visibility: { dependsOn: "mid", values: ["Option2"] },
          },
        ],
        { kind: "No", mid: "Option2", leaf: "secret" },
      ),
    ).toEqual({ kind: "No", mid: "", leaf: "" });
  });

  it("leaves bound fields alone", () => {
    expect(
      clearHiddenFieldValues(
        [
          { id: "type" },
          {
            id: "title",
            binding: "title",
            visibility: { dependsOn: "type", values: ["Company"] },
          },
        ],
        { type: "Personal", title: "Acme" },
      ),
    ).toEqual({ type: "Personal", title: "Acme" });
  });
});
