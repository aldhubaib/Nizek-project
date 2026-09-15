import { describe, expect, it } from "vitest";
import {
  CARD_RECORD_NUMBER_KEY,
  fieldPickerPrefsFromVisible,
  resolveCardFieldIds,
  resolveTableColumnIds,
  TABLE_STATUS_KEY,
} from "../../src/lib/modules/card-fields";
import type { CustomFieldDTO } from "../../src/actions/custom-field";

const title = {
  id: "title_1",
  binding: "title",
  type: "text",
} as CustomFieldDTO;

const extra = {
  id: "fld_1",
  binding: null,
  type: "select",
} as CustomFieldDTO;

const fields = [title, extra];

describe("resolveCardFieldIds", () => {
  it("hides the id after the user turns it off", () => {
    const saved = fieldPickerPrefsFromVisible(["fld_1"], ["fld_1"]);
    expect(saved.seen).toContain(CARD_RECORD_NUMBER_KEY);
    expect(resolveCardFieldIds(fields, saved)).toEqual(["fld_1"]);
  });

  it("keeps the id on when the user has not changed anything", () => {
    expect(resolveCardFieldIds(fields, null)).toContain(CARD_RECORD_NUMBER_KEY);
  });
});

describe("resolveTableColumnIds", () => {
  it("keeps the id on for older table prefs that never had a toggle", () => {
    const saved = {
      visible: [TABLE_STATUS_KEY, "fld_1"],
      seen: [TABLE_STATUS_KEY, "fld_1"],
    };
    expect(resolveTableColumnIds(fields, saved)).toContain(
      CARD_RECORD_NUMBER_KEY,
    );
  });

  it("hides the id after the user turns it off in the table", () => {
    const saved = fieldPickerPrefsFromVisible(
      [TABLE_STATUS_KEY, "fld_1"],
      [TABLE_STATUS_KEY, "fld_1"],
    );
    expect(resolveTableColumnIds(fields, saved)).not.toContain(
      CARD_RECORD_NUMBER_KEY,
    );
  });
});
