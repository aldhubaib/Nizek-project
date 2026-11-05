import { describe, expect, it } from "vitest";
import { canPreviewNextUi } from "../../src/lib/next-ui-access";

describe("canPreviewNextUi", () => {
  it("lets a listed email in, however it is cased or padded", () => {
    expect(canPreviewNextUi({ email: "aldhubaib@nizek.com" })).toBe(true);
    expect(canPreviewNextUi({ email: "  Aldhubaib@Nizek.com " })).toBe(true);
  });

  it("keeps everyone else out, admins included", () => {
    expect(canPreviewNextUi({ email: "lulwah@nizek.com" })).toBe(false);
    expect(canPreviewNextUi({ email: "" })).toBe(false);
    expect(canPreviewNextUi({ email: null })).toBe(false);
    expect(canPreviewNextUi(null)).toBe(false);
    expect(canPreviewNextUi(undefined)).toBe(false);
  });
});
