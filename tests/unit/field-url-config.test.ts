import { describe, expect, it } from "vitest";
import {
  parseUrlConfig,
  stringifyUrlConfig,
} from "../../src/lib/fields/url-config";

describe("url field config", () => {
  it("defaults to no icon", () => {
    expect(parseUrlConfig(null).icon).toBeNull();
    expect(parseUrlConfig("[]").icon).toBeNull();
    expect(parseUrlConfig('{"icon":"nope"}').icon).toBeNull();
  });

  it("reads a known brand", () => {
    expect(parseUrlConfig('{"icon":"linkedin"}').icon).toBe("linkedin");
    expect(parseUrlConfig('{"icon":"nizek"}').icon).toBe("nizek");
  });

  it("round-trips a chosen icon and clears none", () => {
    expect(stringifyUrlConfig({ icon: "x" })).toBe('{"icon":"x"}');
    expect(stringifyUrlConfig({ icon: null })).toBeNull();
    expect(parseUrlConfig(stringifyUrlConfig({ icon: "instagram" })).icon).toBe(
      "instagram",
    );
  });
});
