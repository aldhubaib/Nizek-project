import { describe, expect, it } from "vitest";
import {
  articleFieldIsFilled,
  formatArticleField,
  parseArticleValue,
  stringifyArticleValue,
} from "../../src/lib/fields/article";
import { customFieldIsFilled } from "../../src/lib/fields/validate";

describe("article field", () => {
  it("treats empty html as empty", () => {
    expect(parseArticleValue("")).toEqual({ en: "", ar: "" });
    expect(stringifyArticleValue({ en: "<p></p>", ar: "<p><br></p>" })).toBe("");
    expect(articleFieldIsFilled("")).toBe(false);
  });

  it("round-trips english and arabic", () => {
    const raw = stringifyArticleValue({
      en: "<p>Hello</p>",
      ar: "<p>مرحبا</p>",
    });
    expect(parseArticleValue(raw)).toEqual({
      en: "<p>Hello</p>",
      ar: "<p>مرحبا</p>",
    });
  });

  it("is filled when only english has text", () => {
    const raw = stringifyArticleValue({
      en: "<p>Hello world</p>",
      ar: "<p></p>",
    });
    expect(articleFieldIsFilled(raw)).toBe(true);
    expect(customFieldIsFilled("article", raw)).toBe(true);
  });

  it("is filled when only arabic has text", () => {
    const raw = stringifyArticleValue({
      en: "",
      ar: "<p>مرحبا بالعالم</p>",
    });
    expect(articleFieldIsFilled(raw)).toBe(true);
    expect(customFieldIsFilled("article", raw)).toBe(true);
  });

  it("shows a short excerpt on cards", () => {
    expect(
      formatArticleField(
        stringifyArticleValue({
          en: "<p>A short piece</p>",
          ar: "",
        }),
      ),
    ).toBe("A short piece");
  });
});
