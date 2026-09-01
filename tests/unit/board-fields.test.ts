import { describe, it, expect } from "vitest";
import {
  isCardComplete,
  isFieldAnswered,
  missingRequiredFields,
  type BoardFieldShape,
} from "@/lib/board-fields";

function field(overrides: Partial<BoardFieldShape> = {}): BoardFieldShape {
  return {
    id: "f1",
    label: "Notes",
    type: "text",
    required: true,
    ...overrides,
  };
}

describe("isFieldAnswered", () => {
  it("counts text", () => {
    expect(isFieldAnswered({ type: "text" }, "something")).toBe(true);
  });

  it("does not count blank or whitespace", () => {
    expect(isFieldAnswered({ type: "text" }, "")).toBe(false);
    expect(isFieldAnswered({ type: "text" }, "   ")).toBe(false);
    expect(isFieldAnswered({ type: "text" }, null)).toBe(false);
    expect(isFieldAnswered({ type: "text" }, undefined)).toBe(false);
  });

  it("counts a single-choice select as plain text", () => {
    expect(isFieldAnswered({ type: "select" }, "High")).toBe(true);
  });

  it("reads a multi-select's JSON array", () => {
    const multi = { type: "select", multiple: true };
    expect(isFieldAnswered(multi, JSON.stringify(["a"]))).toBe(true);
    expect(isFieldAnswered(multi, JSON.stringify([]))).toBe(false);
  });

  it("counts a value saved before multiple was turned on", () => {
    // A bare string left behind by a single-choice select is still an answer,
    // and must not read as blank once the field is switched to multi.
    expect(isFieldAnswered({ type: "select", multiple: true }, "High")).toBe(true);
  });

  it("reads a file field's name::url list", () => {
    const file = { type: "file" };
    expect(isFieldAnswered(file, "spec.pdf::https://x/y.pdf")).toBe(true);
    expect(
      isFieldAnswered(file, "a.png::https://x/a.png|||b.png::https://x/b.png"),
    ).toBe(true);
    expect(isFieldAnswered(file, "")).toBe(false);
  });

  it("reads a file field stored as JSON", () => {
    expect(isFieldAnswered({ type: "file" }, JSON.stringify(["a.png"]))).toBe(true);
    expect(isFieldAnswered({ type: "file" }, JSON.stringify([]))).toBe(false);
  });
});

describe("missingRequiredFields", () => {
  it("ignores optional fields, however blank", () => {
    const fields = [field({ id: "a", required: false })];
    expect(missingRequiredFields(fields, {})).toEqual([]);
  });

  it("names the required fields left blank", () => {
    const fields = [
      field({ id: "a", label: "Link" }),
      field({ id: "b", label: "Owner" }),
      field({ id: "c", required: false }),
    ];
    const missing = missingRequiredFields(fields, { a: "https://x" });
    expect(missing.map((f) => f.id)).toEqual(["b"]);
  });

  it("keeps the order the fields are asked in", () => {
    const fields = [field({ id: "a" }), field({ id: "b" }), field({ id: "c" })];
    expect(missingRequiredFields(fields, {}).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

describe("isCardComplete", () => {
  it("is true for a card with no fields at all", () => {
    expect(isCardComplete([], {})).toBe(true);
  });

  it("is true once every required field is answered", () => {
    const fields = [field({ id: "a" }), field({ id: "b", required: false })];
    expect(isCardComplete(fields, { a: "done" })).toBe(true);
  });

  it("is false while a required field is blank", () => {
    expect(isCardComplete([field({ id: "a" })], { a: "  " })).toBe(false);
  });
});
