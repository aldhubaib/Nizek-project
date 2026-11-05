import { describe, expect, it } from "vitest";

import {
  contractDates,
  contractName,
  contractState,
  daysText,
  isActiveProject,
  projectStanding,
  type ContractLike,
} from "@/next-ui/screens/projects/project-state";

const now = new Date("2026-11-05T12:00:00+03:00");

const contract = (over: Partial<ContractLike>): ContractLike => ({
  id: "c",
  label: null,
  code: null,
  contractType: "FULL_TEAM",
  startDate: "2026-01-01T00:00:00Z",
  endDate: "2026-12-31T00:00:00Z",
  latePayment: false,
  ...over,
});

describe("a project's standing", () => {
  it("is active inside a paid-up contract window, with the days left", () => {
    const s = projectStanding([contract({})], now);
    expect(s.state).toBe("active");
    expect(s.days).toBe(57);
    expect(daysText(s)).toBe("57 days left");
    expect(isActiveProject([contract({})], now)).toBe(true);
  });

  it("is late when the current contract is flagged, even beside a paid one", () => {
    const s = projectStanding([contract({ id: "a" }), contract({ id: "b", latePayment: true })], now);
    expect(s.state).toBe("late");
    expect(s.contract?.id).toBe("b");
    expect(isActiveProject([contract({ latePayment: true })], now)).toBe(false);
  });

  it("is upcoming before the next contract starts, counting the days to it", () => {
    const s = projectStanding(
      [contract({ id: "old", startDate: "2025-01-01", endDate: "2025-06-30" }), contract({ id: "next", startDate: "2026-11-20", endDate: "2027-11-19" })],
      now,
    );
    expect(s.state).toBe("upcoming");
    expect(s.contract?.id).toBe("next");
    expect(daysText(s)).toBe("Starts in 15 days");
  });

  it("is archived with nothing current and no next contract", () => {
    expect(projectStanding([], now)).toEqual({ state: "archived", contract: null, days: null });
    expect(projectStanding([contract({ startDate: "2025-01-01", endDate: "2025-06-30" })], now).state).toBe("archived");
    expect(daysText(projectStanding([], now))).toBeNull();
  });

  it("names and dates a contract from what it has", () => {
    expect(contractName(contract({ label: " Website ", code: "NZK-1" }))).toBe("Website");
    expect(contractName(contract({ code: "NZK-1" }))).toBe("NZK-1");
    expect(contractName(contract({ contractType: "MAINTENANCE" }))).toBe("Maintenance");
    expect(contractDates(contract({}))).toBe("1 Jan 2026 – 31 Dec 2026");
    expect(contractDates(contract({ endDate: null }))).toBe("from 1 Jan 2026");
    expect(contractDates(contract({ startDate: null, endDate: null }))).toBe("No dates");
  });

  it("states one contract on its own", () => {
    expect(contractState(contract({}), now)).toBe("active");
    expect(contractState(contract({ latePayment: true }), now)).toBe("late");
    expect(contractState(contract({ startDate: "2027-01-01", endDate: "2027-12-31" }), now)).toBe("upcoming");
    expect(contractState(contract({ startDate: "2025-01-01", endDate: "2025-12-31" }), now)).toBe("expired");
  });
});
