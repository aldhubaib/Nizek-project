import { describe, it, expect } from "vitest";
import {
  classifyStageDuration,
  isRejectedFlag,
  severityRank,
  compareAuditItems,
  buildOwnershipTimeline,
  blameCandidates,
  msToHours,
  formatStageHours,
  utcDateOnly,
  WARN_LATE_MS,
  CRITICAL_LATE_MS,
} from "@/lib/audit-flags";

const DAY = 24 * 60 * 60 * 1000;

describe("classifyStageDuration", () => {
  it("is quiet below the 2-day warn threshold", () => {
    expect(classifyStageDuration(0)).toBeNull();
    expect(classifyStageDuration(WARN_LATE_MS - 1)).toBeNull();
  });

  it("warns between 2 and 7 days", () => {
    expect(classifyStageDuration(WARN_LATE_MS)).toBe("warn_late");
    expect(classifyStageDuration(3 * DAY)).toBe("warn_late");
    expect(classifyStageDuration(CRITICAL_LATE_MS - 1)).toBe("warn_late");
  });

  it("escalates to critical at 7 days", () => {
    expect(classifyStageDuration(CRITICAL_LATE_MS)).toBe("critical_late");
    expect(classifyStageDuration(30 * DAY)).toBe("critical_late");
  });
});

describe("isRejectedFlag", () => {
  it("matches the dashboard rule: flagged only when declined more than twice", () => {
    expect(isRejectedFlag(0)).toBe(false);
    expect(isRejectedFlag(2)).toBe(false);
    expect(isRejectedFlag(3)).toBe(true);
  });
});

describe("compareAuditItems", () => {
  it("orders by severity group first", () => {
    const critical = { severity: severityRank("critical_late"), stageHours: 200 };
    const rejected = { severity: severityRank("rejected"), declineCount: 5 };
    const warn = { severity: severityRank("warn_late"), stageHours: 60 };
    const sorted = [warn, rejected, critical].sort(compareAuditItems);
    expect(sorted).toEqual([critical, rejected, warn]);
  });

  it("puts the worst offender first within a group", () => {
    const a = { severity: 0, stageHours: 300 };
    const b = { severity: 0, stageHours: 500 };
    expect([a, b].sort(compareAuditItems)[0]).toBe(b);

    const r1 = { severity: 1, declineCount: 3 };
    const r2 = { severity: 1, declineCount: 6 };
    expect([r1, r2].sort(compareAuditItems)[0]).toBe(r2);

    // Most overdue deadline (most negative dueInDays) first.
    const d1 = { severity: 2, dueInDays: -2 };
    const d2 = { severity: 2, dueInDays: -10 };
    expect([d1, d2].sort(compareAuditItems)[0]).toBe(d2);
  });
});

describe("buildOwnershipTimeline", () => {
  const user = (id: string, name: string) => ({ id, name, imageUrl: null });

  it("keeps only ownership/flow events and labels them", () => {
    const timeline = buildOwnershipTimeline([
      { action: "created", createdAt: "2026-07-01T10:00:00Z", user: user("u1", "PM") },
      {
        action: "updated",
        field: "title",
        createdAt: "2026-07-01T11:00:00Z",
        user: user("u1", "PM"),
      },
      {
        action: "assigned",
        field: "assignee",
        newValue: "Ahmed",
        createdAt: "2026-07-02T10:00:00Z",
        user: user("u1", "PM"),
      },
      {
        action: "moved",
        field: "stage",
        oldValue: "READY_FOR_DEV",
        newValue: "IN_DEVELOPMENT",
        createdAt: "2026-07-03T10:00:00Z",
        user: user("u2", "Ahmed"),
      },
      {
        action: "declined",
        field: "stage",
        oldValue: "INTERNAL_REVIEW",
        newValue: "IN_DEVELOPMENT",
        createdAt: "2026-07-05T10:00:00Z",
        user: user("u3", "Reviewer"),
      },
      { action: "answered", createdAt: "2026-07-06T10:00:00Z", user: user("u4", "Client") },
    ]);

    expect(timeline).toHaveLength(4);
    expect(timeline[0].label).toBe("Created the task");
    expect(timeline[1].label).toBe("Assigned to Ahmed");
    expect(timeline[2].label).toBe("Moved Ready for Dev → In Development");
    expect(timeline[3].label).toBe("Declined at Internal Review");
  });

  it("includes 'updated assignee' (take-ownership) events", () => {
    const timeline = buildOwnershipTimeline([
      {
        action: "updated",
        field: "assignee",
        newValue: "Sara",
        createdAt: "2026-07-02T10:00:00Z",
        user: user("u5", "Sara"),
      },
    ]);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toContain("Took ownership");
  });
});

describe("blameCandidates", () => {
  it("dedupes people and orders by latest involvement first", () => {
    const candidates = blameCandidates([
      { userId: "u1", userName: "PM", label: "Created", at: "2026-07-01T00:00:00Z" },
      { userId: "u2", userName: "Dev", label: "Moved", at: "2026-07-03T00:00:00Z" },
      { userId: "u1", userName: "PM", label: "Assigned", at: "2026-07-05T00:00:00Z" },
    ]);
    expect(candidates.map((c) => c.userId)).toEqual(["u1", "u2"]);
  });
});

describe("helpers", () => {
  it("msToHours floors and formatStageHours switches to days at 48h", () => {
    expect(msToHours(3 * 60 * 60 * 1000 + 1000)).toBe(3);
    expect(formatStageHours(47)).toBe("47h");
    expect(formatStageHours(49)).toBe("2d");
    expect(formatStageHours(240)).toBe("10d");
  });

  it("utcDateOnly strips the time component", () => {
    const d = utcDateOnly(new Date("2026-07-20T18:45:12.345Z"));
    expect(d.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });
});
