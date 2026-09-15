import { describe, expect, it } from "vitest";
import {
  joinFormulaParts,
  parseFormulaConfig,
  stringifyFormulaConfig,
} from "../../src/lib/fields/formula-config";
import { formatFieldValue } from "../../src/lib/fields/display";
import type { CustomFieldDTO } from "../../src/actions/custom-field";
import type { DealDTO } from "../../src/actions/deal";
import { EMPTY_RELATED_CATALOG } from "../../src/lib/fields/relations";

describe("joinFormulaParts", () => {
  it("joins first and last name with a space", () => {
    expect(
      joinFormulaParts(
        ["first", "last"],
        { first: "Jane", last: "Doe" },
      ),
    ).toBe("Jane Doe");
  });

  it("skips empty parts", () => {
    expect(
      joinFormulaParts(["first", "middle", "last"], {
        first: "Jane",
        middle: "",
        last: "Doe",
      }),
    ).toBe("Jane Doe");
  });
});

describe("parseFormulaConfig", () => {
  it("round-trips parts and card title", () => {
    const config = {
      parts: ["a", "b"],
      separator: " ",
      cardTitle: true,
    };
    expect(parseFormulaConfig(stringifyFormulaConfig(config))).toEqual(config);
  });
});

describe("formatFieldValue formula", () => {
  it("builds full name from sibling text fields", () => {
    const first = {
      id: "first",
      type: "text",
      binding: null,
    } as CustomFieldDTO;
    const last = {
      id: "last",
      type: "text",
      binding: null,
    } as CustomFieldDTO;
    const full = {
      id: "full",
      type: "formula",
      binding: null,
      formula: { parts: ["first", "last"], separator: " ", cardTitle: true },
    } as CustomFieldDTO;
    const record = {
      title: "Ignored",
      fieldValues: { first: "Jane", last: "Doe" },
      contacts: [],
      companies: [],
      value: null,
    } as unknown as DealDTO;
    expect(
      formatFieldValue(full, record, {
        users: [],
        related: EMPTY_RELATED_CATALOG,
        fields: [first, last, full],
      }),
    ).toBe("Jane Doe");
  });
});
