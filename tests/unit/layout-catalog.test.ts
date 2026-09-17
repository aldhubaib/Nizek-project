import { describe, expect, it } from "vitest";
import type { CustomFieldCatalogDTO, CustomFieldDTO } from "../../src/actions/custom-field";
import {
  containerOf,
  moveDraggedField,
  moveDraggedSection,
  upsertField,
} from "../../src/components/fields/layout-editor";

function field(id: string, sectionId: string | null = null): CustomFieldDTO {
  return {
    id,
    entityType: "deal",
    key: id,
    label: id,
    type: "text",
    options: [],
    relation: null,
    script: null,
    binding: null,
    required: false,
    showOn: "both",
    filterable: false,
    unique: false,
    visibility: null,
    userMultiple: false,
    countryMultiple: false,
    urlIcon: null,
    formula: null,
    sectionId,
    position: 0,
  };
}

function catalog(): CustomFieldCatalogDTO {
  return {
    layoutId: "layout_1",
    sections: [
      {
        id: "sec_a",
        entityType: "deal",
        name: "Our Role",
        position: 0,
        columns: 1,
        fields: [],
      },
    ],
    unsectioned: [field("fld_1")],
  };
}

describe("layout field drag", () => {
  it("moves an unsectioned field onto a section lane", () => {
    const next = moveDraggedField(catalog(), "fld_1", "lane:sec_a");
    expect(next?.unsectioned).toEqual([]);
    expect(next?.sections[0].fields.map((row) => row.id)).toEqual(["fld_1"]);
    expect(next?.sections[0].fields[0].sectionId).toBe("sec_a");
  });

  it("moves a field through the section menu without duplicating it", () => {
    const next = upsertField(catalog(), field("fld_1", "sec_a"));
    expect(next.unsectioned).toEqual([]);
    expect(next.sections[0].fields.map((row) => row.id)).toEqual(["fld_1"]);
  });

  it("resolves lane and section sortable ids to the same container", () => {
    const layout = catalog();
    expect(containerOf(layout, "lane:sec_a")).toBe("sec_a");
    expect(containerOf(layout, "section:sec_a")).toBe("sec_a");
    expect(containerOf(layout, "lane:unsectioned")).toBe("unsectioned");
  });

  it("reorders sections when dropping one card on another", () => {
    const two: CustomFieldCatalogDTO = {
      ...catalog(),
      sections: [
        catalog().sections[0],
        {
          id: "sec_b",
          entityType: "deal",
          name: "Event Details",
          position: 1,
          columns: 1,
          fields: [],
        },
      ],
    };
    const next = moveDraggedSection(two, "section:sec_b", "section:sec_a");
    expect(next?.sections.map((section) => section.id)).toEqual(["sec_b", "sec_a"]);
  });
});
