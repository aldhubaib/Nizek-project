import { describe, expect, it } from "vitest";
import { filterNoteSymbols, NOTE_SYMBOLS } from "../../src/components/tiptap/note-symbols";

describe("filterNoteSymbols", () => {
  it("returns the full set with an empty query", () => {
    expect(filterNoteSymbols("")).toEqual(NOTE_SYMBOLS);
  });

  it("finds the check and cross from heading-style notes", () => {
    expect(filterNoteSymbols("check").map((item) => item.glyph)).toContain("✅");
    expect(filterNoteSymbols("missing").map((item) => item.glyph)).toContain("❌");
  });
});
