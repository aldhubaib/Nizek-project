import { describe, expect, it } from "vitest";
import { exclusiveLayoutChoices } from "../../src/lib/modules/layout-assignment";

const layouts = [
  { id: "board", name: "Board" },
  { id: "article", name: "Article" },
];

describe("exclusiveLayoutChoices", () => {
  it("hides a layout already used by another flow", () => {
    const flows = [
      { id: "flow-board", layoutId: "board" },
      { id: "flow-article", layoutId: "board" },
    ];
    expect(
      exclusiveLayoutChoices(layouts, flows, "flow-article").map((row) => row.id),
    ).toEqual(["board", "article"]);
    expect(
      exclusiveLayoutChoices(layouts, flows, "flow-board").map((row) => row.id),
    ).toEqual(["board", "article"]);
  });

  it("keeps the current layout and drops the rest that are taken", () => {
    const flows = [
      { id: "flow-board", layoutId: "board" },
      { id: "flow-article", layoutId: "article" },
    ];
    expect(
      exclusiveLayoutChoices(layouts, flows, "flow-board").map((row) => row.id),
    ).toEqual(["board"]);
    expect(
      exclusiveLayoutChoices(layouts, flows, "flow-article").map((row) => row.id),
    ).toEqual(["article"]);
  });
});
