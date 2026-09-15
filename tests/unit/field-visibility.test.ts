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

  it("hides nested fields when an ancestor pick list no longer matches", () => {
    const eventCost = {
      visibility: { dependsOn: "role", values: ["Participating"] },
    };
    const cost = {
      visibility: { dependsOn: "eventCost", values: ["paid"] },
    };
    const catalog = [
      { id: "role" },
      {
        id: "eventCost",
        visibility: { dependsOn: "role", values: ["Participating"] },
      },
      {
        id: "cost",
        visibility: { dependsOn: "eventCost", values: ["paid"] },
      },
    ];
    const values = { role: "Observing", eventCost: "paid", cost: "100" };
    const ids = catalog.map((row) => row.id);
    expect(fieldIsLogicallyVisible(eventCost, values, ids, catalog)).toBe(false);
    expect(fieldIsLogicallyVisible(cost, values, ids, catalog)).toBe(false);
  });

  it("walks an arbitrary ancestor chain until a parent no longer matches", () => {
    const catalog = [
      { id: "a" },
      { id: "b", visibility: { dependsOn: "a", values: ["1"] } },
      { id: "c", visibility: { dependsOn: "b", values: ["2"] } },
      { id: "d", visibility: { dependsOn: "c", values: ["3"] } },
      { id: "e", visibility: { dependsOn: "d", values: ["4"] } },
      { id: "f", visibility: { dependsOn: "e", values: ["5"] } },
      { id: "g", visibility: { dependsOn: "f", values: ["6"] } },
      { id: "h", visibility: { dependsOn: "g", values: ["7"] } },
      { id: "i", visibility: { dependsOn: "h", values: ["8"] } },
    ];
    const values = {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
      e: "5",
      f: "6",
      g: "7",
      h: "8",
      i: "yes",
    };
    const ids = catalog.map((row) => row.id);
    const leaf = { visibility: { dependsOn: "h", values: ["8"] } };
    expect(fieldIsLogicallyVisible(leaf, values, ids, catalog)).toBe(true);
    expect(
      fieldIsLogicallyVisible(leaf, { ...values, a: "0" }, ids, catalog),
    ).toBe(false);
  });

  it("stops walking if a show-when cycle is configured", () => {
    const catalog = [
      { id: "a", visibility: { dependsOn: "b", values: ["yes"] } },
      { id: "b", visibility: { dependsOn: "a", values: ["yes"] } },
    ];
    const values = { a: "yes", b: "yes" };
    const ids = catalog.map((row) => row.id);
    expect(
      fieldIsLogicallyVisible(
        { visibility: { dependsOn: "a", values: ["yes"] } },
        values,
        ids,
        catalog,
      ),
    ).toBe(true);
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
    expect(
      fieldAppliesOnForm({ ...field, showOn: "hidden" }, "create", {
        type: "Company",
      }),
    ).toBe(false);
    expect(
      fieldAppliesOnForm({ ...field, showOn: "hidden" }, "edit", {
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
