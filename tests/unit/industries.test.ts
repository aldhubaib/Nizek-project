import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  industryLabel,
  isIndustry,
} from "../../src/lib/industries";

describe("industries", () => {
  it("has no duplicate ids", () => {
    // A repeated id would silently shadow the earlier entry in the lookup map,
    // so every company filed under it would show the wrong label.
    const ids = INDUSTRIES.map((industry) => industry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate labels", () => {
    const labels = INDUSTRIES.map((industry) => industry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses ids that are safe to store and compare", () => {
    for (const industry of INDUSTRIES) {
      expect(industry.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(industry.label.trim()).toBe(industry.label);
      expect(industry.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps Other last, since it is the fallback rather than a choice", () => {
    expect(INDUSTRIES.at(-1)?.id).toBe("other");
  });

  it("lists everything but Other alphabetically by label", () => {
    const choices = INDUSTRIES.slice(0, -1).map((i) => i.label);
    expect(choices).toEqual([...choices].sort((a, b) => a.localeCompare(b)));
  });

  it("recognises its own ids and nothing else", () => {
    expect(isIndustry("fintech")).toBe(true);
    expect(isIndustry("oil_gas")).toBe(true);
    expect(isIndustry("Fintech")).toBe(false);
    expect(isIndustry("crypto-bro-consultancy")).toBe(false);
    expect(isIndustry("")).toBe(false);
  });

  it("labels a known id and falls back to the raw value", () => {
    expect(industryLabel("fintech")).toBe("Fintech");
    expect(industryLabel("oil_gas")).toBe("Oil & Gas");
    // Better a visible unknown id than a blank cell.
    expect(industryLabel("made_up")).toBe("made_up");
    expect(industryLabel(null)).toBe("");
    expect(industryLabel(undefined)).toBe("");
  });
});
