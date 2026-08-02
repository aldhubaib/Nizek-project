import { describe, it, expect } from "vitest";
import {
  valuationAsOf,
  valuationChangePct,
  equityValueAt,
  isTrancheDiluted,
  splitTranchesByDilution,
  sumTrancheEquity,
  type ValuationEntry,
} from "@/lib/equity-math";

const SEED: ValuationEntry = { valuedAt: "2026-01-15T00:00:00.000Z", amount: 1_000_000 };
const SERIES_A: ValuationEntry = { valuedAt: "2026-06-01T00:00:00.000Z", amount: 4_000_000 };
const PLANNED: ValuationEntry = { valuedAt: "2027-01-01T00:00:00.000Z", amount: 9_000_000 };

const ASOF = new Date("2026-08-01T00:00:00.000Z");

describe("valuationAsOf", () => {
  it("returns null when there is nothing recorded", () => {
    expect(valuationAsOf([], ASOF)).toBeNull();
  });

  it("picks the newest valuation dated on or before the cutoff", () => {
    expect(valuationAsOf([SEED, SERIES_A], ASOF)).toEqual(SERIES_A);
  });

  it("does not sort in place, so caller order survives", () => {
    const input = [SEED, SERIES_A];
    valuationAsOf(input, ASOF);
    expect(input).toEqual([SEED, SERIES_A]);
  });

  it("ignores future-dated rounds so a planned raise isn't read as current", () => {
    expect(valuationAsOf([SEED, SERIES_A, PLANNED], ASOF)).toEqual(SERIES_A);
  });

  it("includes a valuation dated exactly on the cutoff", () => {
    const today: ValuationEntry = { valuedAt: ASOF.toISOString(), amount: 5_000_000 };
    expect(valuationAsOf([SERIES_A, today], ASOF)).toEqual(today);
  });

  it("finds the newest regardless of input order", () => {
    expect(valuationAsOf([SERIES_A, SEED], ASOF)).toEqual(SERIES_A);
  });

  it("returns null when every entry is in the future", () => {
    expect(valuationAsOf([PLANNED], ASOF)).toBeNull();
  });
});

describe("valuationChangePct", () => {
  it("reports growth between two rounds", () => {
    expect(valuationChangePct(4_000_000, 1_000_000)).toBe(300);
  });

  it("reports a down round as negative", () => {
    expect(valuationChangePct(750_000, 1_000_000)).toBe(-25);
  });

  it("has no baseline for the first valuation", () => {
    expect(valuationChangePct(1_000_000, undefined)).toBeNull();
  });

  it("avoids dividing by a zero baseline", () => {
    expect(valuationChangePct(1_000_000, 0)).toBeNull();
  });
});

// The reference deal: a 20% non-diluted stake that dilutes 5% at 2M, another
// 5% at 4M and the last 10% at 6M.
const DEAL = [
  { equityPct: 5, startsAtValuation: 2_000_000 },
  { equityPct: 5, startsAtValuation: 4_000_000 },
  { equityPct: 10, startsAtValuation: 6_000_000 },
];

describe("isTrancheDiluted", () => {
  it("triggers exactly at the threshold, not a hair under", () => {
    expect(isTrancheDiluted(2_000_000, 1_999_999)).toBe(false);
    expect(isTrancheDiluted(2_000_000, 2_000_000)).toBe(true);
  });

  it("treats an unvalued company as nothing diluted", () => {
    expect(isTrancheDiluted(2_000_000, null)).toBe(false);
    expect(isTrancheDiluted(2_000_000, undefined)).toBe(false);
  });
});

describe("splitTranchesByDilution", () => {
  it("keeps the whole stake non-diluted before the first milestone", () => {
    expect(splitTranchesByDilution(DEAL, 1_500_000)).toEqual({ diluted: 0, nonDiluted: 20 });
  });

  it("dilutes the first 5% once the company is worth 2M", () => {
    expect(splitTranchesByDilution(DEAL, 2_000_000)).toEqual({ diluted: 5, nonDiluted: 15 });
  });

  it("dilutes 10% at 4M and everything at 6M", () => {
    expect(splitTranchesByDilution(DEAL, 4_000_000)).toEqual({ diluted: 10, nonDiluted: 10 });
    expect(splitTranchesByDilution(DEAL, 6_000_000)).toEqual({ diluted: 20, nonDiluted: 0 });
  });

  it("stays fully diluted above the last milestone", () => {
    expect(splitTranchesByDilution(DEAL, 50_000_000)).toEqual({ diluted: 20, nonDiluted: 0 });
  });

  it("dilutes nothing when the company has never been valued", () => {
    expect(splitTranchesByDilution(DEAL, null)).toEqual({ diluted: 0, nonDiluted: 20 });
  });

  it("always splits the full grant, whatever the valuation", () => {
    const total = sumTrancheEquity(DEAL);
    for (const valuation of [0, 2_000_000, 4_000_000, 6_000_000, 99_000_000]) {
      const split = splitTranchesByDilution(DEAL, valuation);
      expect(split.diluted + split.nonDiluted).toBe(total);
    }
  });
});

describe("equityValueAt", () => {
  it("prices a stake at the given valuation", () => {
    expect(equityValueAt(20, 2_000_000)).toBe(400_000);
  });

  it("keeps fractional stakes exact enough to display", () => {
    expect(equityValueAt(19.877, 1_000_000)).toBeCloseTo(198_770, 5);
  });

  it("is null when either side is missing", () => {
    expect(equityValueAt(20, null)).toBeNull();
    expect(equityValueAt(null, 2_000_000)).toBeNull();
  });
});
