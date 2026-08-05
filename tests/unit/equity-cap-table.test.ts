import { describe, it, expect } from "vitest";
import {
  currentSet,
  computePortfolioEquity,
  originalSet,
  ourGrants,
  ourPctIn,
  ownershipAsOf,
  splitTotal,
  unallocatedPct,
  type SetEntry,
} from "@/lib/equity-math";

const NOW = new Date("2026-08-03T00:00:00.000Z");

const US = { isUs: true };
const THEM = { isUs: false };

const FOUNDING: SetEntry = {
  effectiveOn: "2026-01-01T00:00:00.000Z",
  valuation: null,
  grants: [
    { equityPct: 20, holder: US },
    { equityPct: 80, holder: THEM },
  ],
};

const AFTER_SEED: SetEntry = {
  effectiveOn: "2026-06-01T00:00:00.000Z",
  valuation: 2_000_000,
  grants: [
    { equityPct: 16, holder: US },
    { equityPct: 64, holder: THEM },
    { equityPct: 20, holder: THEM },
  ],
};

const PLANNED: SetEntry = {
  effectiveOn: "2027-01-01T00:00:00.000Z",
  valuation: 9_000_000,
  grants: [{ equityPct: 12, holder: US }],
};

describe("ourGrants", () => {
  it("picks out the rows naming us", () => {
    expect(ourGrants(AFTER_SEED.grants)).toEqual([{ equityPct: 16, holder: US }]);
  });

  it("reads an unnamed split as entirely ours, which is what it meant before names", () => {
    const unnamed = [{ equityPct: 20 }, { equityPct: 5 }];
    expect(ourGrants(unnamed)).toEqual(unnamed);
  });

  it("returns nothing when the split names people but not us", () => {
    expect(ourGrants([{ equityPct: 100, holder: THEM }])).toEqual([]);
  });
});

describe("ourPctIn", () => {
  it("sums our rows, since a protected stake spans one per milestone", () => {
    const staged: SetEntry = {
      effectiveOn: "2026-01-01T00:00:00.000Z",
      grants: [
        { equityPct: 5, holder: US },
        { equityPct: 5, holder: US },
        { equityPct: 10, holder: US },
        { equityPct: 80, holder: THEM },
      ],
    };
    expect(ourPctIn(staged)).toBe(20);
  });

  it("is null when there is no split at all", () => {
    expect(ourPctIn(null)).toBeNull();
  });
});

describe("currentSet", () => {
  it("returns the newest split in effect", () => {
    expect(currentSet([FOUNDING, AFTER_SEED], NOW)).toBe(AFTER_SEED);
  });

  it("does not depend on the order splits arrive in", () => {
    expect(currentSet([AFTER_SEED, FOUNDING], NOW)).toBe(AFTER_SEED);
  });

  it("ignores a future-dated split so a planned one isn't read as today's", () => {
    expect(currentSet([FOUNDING, AFTER_SEED, PLANNED], NOW)).toBe(AFTER_SEED);
  });

  it("is null before anything has taken effect", () => {
    expect(currentSet([AFTER_SEED], new Date("2026-01-01T00:00:00.000Z"))).toBeNull();
  });
});

describe("originalSet", () => {
  it("is the earliest split, whatever order they arrive in", () => {
    expect(originalSet([AFTER_SEED, FOUNDING])).toBe(FOUNDING);
  });

  it("counts a future-dated split, unlike currentSet — it is still the record", () => {
    expect(originalSet([PLANNED])).toBe(PLANNED);
  });
});

describe("ownershipAsOf", () => {
  it("is our share of the newest split, dilution included", () => {
    expect(ownershipAsOf([FOUNDING, AFTER_SEED], NOW)).toBe(16);
  });

  it("still reads the first split when it is the only one", () => {
    expect(ownershipAsOf([FOUNDING], NOW)).toBe(20);
  });

  it("is null with nothing recorded", () => {
    expect(ownershipAsOf([], NOW)).toBeNull();
  });
});

describe("computePortfolioEquity", () => {
  const ONGOING = [{ id: "c1", startDate: null, endDate: null, lengthUnit: "ONGOING" }];

  it("separates what we were granted from what we hold", () => {
    const { granted, held } = computePortfolioEquity(
      { contracts: ONGOING, sets: [FOUNDING, AFTER_SEED] },
      NOW,
    );
    expect(granted).toBe(20);
    expect(held).toBe(16);
  });

  it("vests against what we hold, not what we were granted", () => {
    const withContract: SetEntry = {
      ...AFTER_SEED,
      grants: [{ equityPct: 16, contractId: "c1", holder: US }],
    };
    const { vested } = computePortfolioEquity(
      { contracts: ONGOING, sets: [FOUNDING, withContract] },
      NOW,
    );
    // An ongoing contract has no term, so the held stake is vested in full.
    expect(vested).toBe(16);
  });

  it("is all null for a project with no splits", () => {
    expect(computePortfolioEquity({ contracts: ONGOING, sets: [] }, NOW)).toEqual({
      granted: null,
      held: null,
      vested: null,
    });
  });
});

describe("splitTotal", () => {
  it("adds up everything a split allocates", () => {
    expect(splitTotal(AFTER_SEED.grants)).toBe(100);
  });
});

describe("unallocatedPct", () => {
  it("is zero when the split adds to 100", () => {
    expect(unallocatedPct(AFTER_SEED)).toBe(0);
  });

  it("reports the gap when only part of the split is known", () => {
    expect(unallocatedPct({ ...AFTER_SEED, grants: [{ equityPct: 16, holder: US }] })).toBe(84);
  });

  it("treats rounding noise from two-decimal entry as fully allocated", () => {
    const noisy: SetEntry = {
      ...AFTER_SEED,
      grants: [
        { equityPct: 33.33, holder: US },
        { equityPct: 33.33, holder: THEM },
        { equityPct: 33.34, holder: THEM },
      ],
    };
    expect(unallocatedPct(noisy)).toBe(0);
  });

  it("goes negative when the split is over-allocated, so it can be flagged", () => {
    const over: SetEntry = {
      ...AFTER_SEED,
      grants: [
        { equityPct: 60, holder: US },
        { equityPct: 60, holder: THEM },
      ],
    };
    expect(unallocatedPct(over)).toBeLessThan(0);
  });

  it("is the whole company when nobody is listed", () => {
    expect(unallocatedPct({ ...AFTER_SEED, grants: [] })).toBe(100);
  });
});
