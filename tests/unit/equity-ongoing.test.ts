import { describe, it, expect } from "vitest";
import {
  computeContractEndDate,
  computePortfolioEquity,
  feeStatus,
  formatContractLength,
  isOngoing,
  lengthInMonths,
  vestedForGrant,
} from "@/lib/equity-math";

const NOW = new Date("2026-08-03T00:00:00.000Z");

const ONGOING = {
  id: "c-ongoing",
  startDate: "2026-01-01",
  endDate: null,
  lengthUnit: "ONGOING",
};

// Half elapsed at NOW, so a term contract is unambiguously mid-vest.
const FIXED = {
  id: "c-fixed",
  startDate: "2026-02-03",
  endDate: "2027-02-03",
  lengthUnit: "MONTHS",
};

describe("isOngoing", () => {
  it("recognises only the ongoing unit", () => {
    expect(isOngoing("ONGOING")).toBe(true);
    expect(isOngoing("MONTHS")).toBe(false);
    expect(isOngoing("YEARS")).toBe(false);
    expect(isOngoing(null)).toBe(false);
    expect(isOngoing(undefined)).toBe(false);
  });
});

describe("an ongoing contract has no term", () => {
  it("has no length in months even if a stale value survived", () => {
    expect(lengthInMonths(12, "ONGOING")).toBeNull();
  });

  it("never derives an end date", () => {
    expect(computeContractEndDate("2026-01-01", 12, "ONGOING")).toBeNull();
  });

  it("reads as Ongoing rather than a duration", () => {
    expect(formatContractLength(null, "ONGOING")).toBe("Ongoing");
    expect(formatContractLength(12, "ONGOING")).toBe("Ongoing");
  });

  it("still formats fixed terms normally", () => {
    expect(formatContractLength(12, "MONTHS")).toBe("12 months");
    expect(formatContractLength(1, "YEARS")).toBe("1 year");
  });
});

describe("feeStatus", () => {
  it("is None for an ongoing contract, which never hands the tech over", () => {
    expect(feeStatus(ONGOING, NOW)).toBe("NONE");
  });

  it("stays None even if an end date somehow lingers", () => {
    expect(feeStatus({ endDate: "2020-01-01", lengthUnit: "ONGOING" }, NOW)).toBe("NONE");
  });

  it("is Estimated while a fixed term is still running", () => {
    expect(feeStatus(FIXED, NOW)).toBe("ESTIMATED");
  });

  it("is Actual once a fixed term has ended", () => {
    expect(feeStatus({ endDate: "2026-01-01", lengthUnit: "MONTHS" }, NOW)).toBe("ACTUAL");
  });

  it("is Estimated when there is no term at all, which is not the same as ongoing", () => {
    expect(feeStatus({ endDate: null, lengthUnit: null }, NOW)).toBe("ESTIMATED");
  });
});

describe("vestedForGrant", () => {
  it("treats an ongoing stake as fully held from day one", () => {
    expect(vestedForGrant(20, ONGOING, NOW)).toBe(20);
  });

  it("is fully vested even before the start date, since nothing is being earned", () => {
    expect(vestedForGrant(20, { ...ONGOING, startDate: "2030-01-01" }, NOW)).toBe(20);
  });

  it("is fully vested with no dates at all", () => {
    expect(vestedForGrant(20, { startDate: null, endDate: null, lengthUnit: "ONGOING" }, NOW)).toBe(20);
  });

  it("still vests a fixed term gradually", () => {
    const vested = vestedForGrant(20, FIXED, NOW);
    expect(vested).not.toBeNull();
    expect(vested!).toBeGreaterThan(0);
    expect(vested!).toBeLessThan(20);
  });

  it("returns null when there is no percentage to vest", () => {
    expect(vestedForGrant(null, ONGOING, NOW)).toBeNull();
  });
});

describe("computePortfolioEquity with a mix of contracts", () => {
  it("counts the ongoing grant in full and the fixed one only as far as it has vested", () => {
    const { granted, vested } = computePortfolioEquity({
      contracts: [ONGOING, FIXED],
      sets: [
        {
          effectiveOn: "2026-01-01T00:00:00.000Z",
          grants: [
            { equityPct: 20, contractId: "c-ongoing" },
            { equityPct: 10, contractId: "c-fixed" },
          ],
        },
      ],
    });

    expect(granted).toBe(30);
    // The ongoing 20 is fully vested, so anything the fixed grant adds sits on
    // top of it without ever reaching the full 30.
    expect(vested!).toBeGreaterThanOrEqual(20);
    expect(vested!).toBeLessThan(30);
  });

  it("vests nothing extra for a fixed grant that has not started", () => {
    const { vested } = computePortfolioEquity({
      contracts: [ONGOING, { ...FIXED, startDate: "2030-01-01", endDate: "2031-01-01" }],
      sets: [
        {
          effectiveOn: "2026-01-01T00:00:00.000Z",
          grants: [
            { equityPct: 20, contractId: "c-ongoing" },
            { equityPct: 10, contractId: "c-fixed" },
          ],
        },
      ],
    });

    expect(vested).toBe(20);
  });
});
