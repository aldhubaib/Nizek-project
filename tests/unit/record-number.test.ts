import { describe, expect, it } from "vitest";
import { formatRecordNumber } from "@/lib/modules/record-number";

describe("formatRecordNumber", () => {
  it("prefixes the sequential id", () => {
    expect(formatRecordNumber(1)).toBe("#1");
    expect(formatRecordNumber(12)).toBe("#12");
  });
});
