import { describe, expect, it } from "vitest";
import {
  parseUserConfig,
  parseUserIds,
  stringifyUserIds,
} from "../../src/lib/fields/user-config";

describe("user field config", () => {
  it("defaults to a single picker", () => {
    expect(parseUserConfig(null).multiple).toBe(false);
    expect(parseUserConfig('{"multiple":true}').multiple).toBe(true);
  });

  it("reads a bare id or a JSON list", () => {
    expect(parseUserIds("abc")).toEqual(["abc"]);
    expect(parseUserIds('["a","b"]')).toEqual(["a", "b"]);
    expect(stringifyUserIds(["a", "b"], false)).toBe("a");
    expect(stringifyUserIds(["a", "b"], true)).toBe('["a","b"]');
  });
});
