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
  const NOW = Date.parse("2026-07-10T10:00:00Z");

  it("reads the lifecycle from StageLog, including moves no activity row records", () => {
    const timeline = buildOwnershipTimeline(
      [
        {
          stage: "BACKLOG",
          fromStage: null,
          enteredAt: "2026-07-01T10:00:00Z",
          exitedAt: "2026-07-02T10:00:00Z",
          source: "TASK_CREATED",
          actor: user("u1", "PM"),
        },
        {
          stage: "TODO",
          fromStage: "PLANNED",
          enteredAt: "2026-07-02T10:00:00Z",
          exitedAt: "2026-07-03T10:00:00Z",
          source: "SPRINT_START",
          sprintName: "Sprint 21",
          actor: user("u1", "PM"),
        },
        {
          stage: "IN_DEVELOPMENT",
          fromStage: "INTERNAL_REVIEW",
          enteredAt: "2026-07-03T10:00:00Z",
          exitedAt: null,
          source: "DECLINE",
          sprintName: "Sprint 21",
          actor: user("u3", "Reviewer"),
        },
      ],
      [],
      NOW,
    );

    expect(timeline.map((e) => e.label)).toEqual([
      "Created the task in Backlog",
      "Started Sprint 21 → Todo",
      "Declined at Internal Review → back to In Development",
    ]);
  });

  it("carries how long the task sat under each person, measuring open visits to now", () => {
    const day = 24 * 60 * 60 * 1000;
    const timeline = buildOwnershipTimeline(
      [
        {
          stage: "IN_DEVELOPMENT",
          fromStage: "TODO",
          enteredAt: "2026-07-01T10:00:00Z",
          exitedAt: "2026-07-04T10:00:00Z",
          source: "USER_MOVE",
          actor: user("u2", "Ahmed"),
        },
        {
          stage: "INTERNAL_REVIEW",
          fromStage: "IN_DEVELOPMENT",
          enteredAt: "2026-07-04T10:00:00Z",
          exitedAt: null,
          source: "USER_MOVE",
          actor: user("u3", "Reviewer"),
        },
      ],
      [],
      NOW,
    );

    expect(timeline[0].heldMs).toBe(3 * day);
    expect(timeline[0].stage).toBe("IN_DEVELOPMENT");
    expect(timeline[1].heldMs).toBe(6 * day);
  });

  it("skips backfilled rows and rows with no actor, which nobody can be blamed for", () => {
    const timeline = buildOwnershipTimeline(
      [
        {
          stage: "BACKLOG",
          enteredAt: "2026-07-01T10:00:00Z",
          source: "MIGRATION",
          actor: user("u1", "PM"),
        },
        {
          stage: "TODO",
          fromStage: "BACKLOG",
          enteredAt: "2026-07-02T10:00:00Z",
          source: "SPRINT_START",
          actor: null,
        },
      ],
      [],
      NOW,
    );

    expect(timeline).toHaveLength(0);
  });

  it("merges assignment changes in by time, since no stage row describes them", () => {
    const timeline = buildOwnershipTimeline(
      [
        {
          stage: "IN_DEVELOPMENT",
          fromStage: "TODO",
          enteredAt: "2026-07-01T10:00:00Z",
          source: "USER_MOVE",
          actor: user("u2", "Ahmed"),
        },
      ],
      [
        {
          action: "assigned",
          field: "assignee",
          newValue: "Sara",
          createdAt: "2026-07-02T10:00:00Z",
          user: user("u5", "Sara"),
        },
        {
          action: "updated",
          field: "title",
          createdAt: "2026-07-03T10:00:00Z",
          user: user("u5", "Sara"),
        },
      ],
      NOW,
    );

    expect(timeline.map((e) => e.label)).toEqual([
      "Moved Todo → In Development",
      "Assigned to Sara",
    ]);
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
