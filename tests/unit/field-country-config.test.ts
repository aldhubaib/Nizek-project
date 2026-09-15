import { describe, expect, it } from "vitest";
import {
  parseCountryConfig,
  stringifyCountryConfig,
} from "../../src/lib/fields/country-config";

describe("country field config", () => {
  it("treats older fields with no options as several countries", () => {
    expect(parseCountryConfig(null).multiple).toBe(true);
    expect(parseCountryConfig(undefined).multiple).toBe(true);
    expect(parseCountryConfig("[]").multiple).toBe(true);
  });

  it("reads one vs several from options JSON", () => {
    expect(parseCountryConfig('{"multiple":false}').multiple).toBe(false);
    expect(parseCountryConfig('{"multiple":true}').multiple).toBe(true);
  });

  it("round-trips the picker setting", () => {
    expect(parseCountryConfig(stringifyCountryConfig({ multiple: false })).multiple).toBe(
      false,
    );
    expect(parseCountryConfig(stringifyCountryConfig({ multiple: true })).multiple).toBe(
      true,
    );
  });
});
