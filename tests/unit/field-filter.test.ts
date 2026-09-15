import { describe, expect, it } from "vitest";
import type { CustomFieldDTO } from "../../src/actions/custom-field";
import type { DealDTO } from "../../src/actions/deal";
import { EMPTY_RELATED_CATALOG } from "../../src/lib/fields/relations";
import {
  EMPTY_FIELD_FILTER,
  fieldFilterChoices,
  recordMatchesFieldFilter,
  recordMatchesFieldFilters,
} from "../../src/lib/fields/filter";

const ctx = { users: [], related: EMPTY_RELATED_CATALOG, fields: [] };

function field(partial: Partial<CustomFieldDTO> & { id: string }): CustomFieldDTO {
  return {
    entityType: "deal",
    key: partial.id,
    label: partial.label ?? partial.id,
    type: "text",
    options: [],
    relation: null,
    script: null,
    binding: null,
    required: false,
    showOn: "both",
    filterable: true,
    visibility: null,
    userMultiple: false,
    countryMultiple: false,
    urlIcon: null,
    formula: null,
    sectionId: null,
    position: 0,
    ...partial,
  };
}

function record(partial: Partial<DealDTO> = {}): DealDTO {
  return {
    id: "rec_1",
    recordNumber: 1,
    title: "Acme event",
    value: null,
    flowId: "flow",
    stageId: null,
    contacts: [],
    companies: [],
    fieldValues: {},
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("recordMatchesFieldFilter", () => {
  const organizer = field({
    id: "type",
    label: "Organizer Type",
    type: "select",
    options: ["Company", "Personal"],
  });

  it("lets every record through when nothing is chosen", () => {
    expect(
      recordMatchesFieldFilter(
        organizer,
        record({ fieldValues: { type: "Company" } }),
        ctx,
        "",
      ),
    ).toBe(true);
  });

  it("keeps a pick-list match and drops the rest", () => {
    const company = record({ fieldValues: { type: "Company" } });
    const personal = record({ fieldValues: { type: "Personal" } });
    expect(recordMatchesFieldFilter(organizer, company, ctx, "Company")).toBe(
      true,
    );
    expect(recordMatchesFieldFilter(organizer, personal, ctx, "Company")).toBe(
      false,
    );
  });

  it("finds records with no answer", () => {
    expect(
      recordMatchesFieldFilter(
        organizer,
        record({ fieldValues: {} }),
        ctx,
        EMPTY_FIELD_FILTER,
      ),
    ).toBe(true);
    expect(
      recordMatchesFieldFilter(
        organizer,
        record({ fieldValues: { type: "Company" } }),
        ctx,
        EMPTY_FIELD_FILTER,
      ),
    ).toBe(false);
  });

  it("matches any value on a multi-select", () => {
    const tags = field({
      id: "tags",
      type: "multi_select",
      options: ["A", "B"],
    });
    const row = record({ fieldValues: { tags: '["A","B"]' } });
    expect(recordMatchesFieldFilter(tags, row, ctx, "B")).toBe(true);
  });
});

describe("recordMatchesFieldFilters", () => {
  it("combines active filters with AND", () => {
    const type = field({
      id: "type",
      type: "select",
      options: ["Company", "Personal"],
    });
    const priority = field({
      id: "prio",
      type: "priority",
    });
    const row = record({
      fieldValues: { type: "Company", prio: "HIGH" },
    });
    expect(
      recordMatchesFieldFilters(
        row,
        [type, priority],
        { type: "Company", prio: "HIGH" },
        ctx,
      ),
    ).toBe(true);
    expect(
      recordMatchesFieldFilters(
        row,
        [type, priority],
        { type: "Company", prio: "LOW" },
        ctx,
      ),
    ).toBe(false);
  });

  it("ignores fields that are not filterable", () => {
    const hidden = field({
      id: "type",
      type: "select",
      filterable: false,
      options: ["Company"],
    });
    expect(
      recordMatchesFieldFilters(
        record({ fieldValues: { type: "Personal" } }),
        [hidden],
        { type: "Company" },
        ctx,
      ),
    ).toBe(true);
  });
});

describe("fieldFilterChoices", () => {
  it("lists pick-list options even when unused", () => {
    const organizer = field({
      id: "type",
      type: "select",
      options: ["Company", "Personal"],
    });
    expect(fieldFilterChoices(organizer, [], ctx).map((row) => row.value)).toEqual(
      ["Company", "Personal"],
    );
  });

  it("lists distinct text values from records", () => {
    const city = field({ id: "city", type: "text" });
    const choices = fieldFilterChoices(
      city,
      [
        record({ fieldValues: { city: "Kuwait" } }),
        record({ id: "rec_2", fieldValues: { city: "Kuwait" } }),
        record({ id: "rec_3", fieldValues: { city: "Dubai" } }),
      ],
      ctx,
    );
    expect(choices.map((row) => row.value)).toEqual(["Dubai", "Kuwait"]);
  });
});
