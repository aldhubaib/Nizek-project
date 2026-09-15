import { describe, expect, it } from "vitest";
import {
  FIELD_PRIORITIES,
  fieldPriorityLabel,
  fieldPriorityRank,
  isFieldPriority,
} from "../../src/lib/fields/priority";

describe("field priority", () => {
  it("has the five levels, highest first", () => {
    expect(FIELD_PRIORITIES).toEqual([
      "VERY_HIGH",
      "HIGH",
      "NORMAL",
      "LOW",
      "VERY_LOW",
    ]);
  });

  it("labels the stored ids", () => {
    expect(fieldPriorityLabel("VERY_HIGH")).toBe("Very high");
    expect(fieldPriorityLabel("HIGH")).toBe("High");
    expect(fieldPriorityLabel("NORMAL")).toBe("Normal");
    expect(fieldPriorityLabel("LOW")).toBe("Low");
    expect(fieldPriorityLabel("VERY_LOW")).toBe("Very low");
  });

  it("ranks very high above very low", () => {
    expect(fieldPriorityRank("VERY_HIGH")).toBeLessThan(fieldPriorityRank("VERY_LOW"));
    expect(isFieldPriority("URGENT")).toBe(false);
  });
});
