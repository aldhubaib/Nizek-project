import { describe, it, expect } from "vitest";
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  DAY_MS,
  DELIVERY_STATUS_LABELS,
  STAGE_GROUP_LABELS,
  STAGE_GROUP_ORDER,
  deliveryStatus,
  emptyStageCounts,
  isDoneStage,
  stageGroup,
  NO_SPRINT_GAP_DAYS,
  QUIET_DAYS,
  RISK_MARGIN,
  TIER_RANK,
  bucketProjects,
  compareProjects,
  compareSignals,
  projectBucket,
  projectRank,
  projectSignals,
  sprintOutcome,
  sprintVerdict,
  workingDaysBetween,
  type AttentionSignal,
  type AttentionTier,
  type ProjectAttentionInput,
} from "@/lib/project-attention";
import { CRITICAL_LATE_MS } from "@/lib/audit-flags";

// A Sunday, so weekday arithmetic below is easy to follow.
const SUNDAY = Date.UTC(2026, 7, 30);

function at(dayOffset: number): number {
  return SUNDAY + dayOffset * DAY_MS;
}

describe("workingDaysBetween", () => {
  it("is zero when the range is empty or inverted", () => {
    expect(workingDaysBetween(at(3), at(3))).toBe(0);
    expect(workingDaysBetween(at(5), at(2))).toBe(0);
  });

  it("counts consecutive weekdays one per day", () => {
    // Sunday -> Wednesday is three working days in a Fri/Sat weekend.
    expect(workingDaysBetween(at(0), at(3))).toBe(3);
  });

  it("skips the weekend", () => {
    // Sunday -> the next Sunday is seven calendar days, five working ones.
    expect(workingDaysBetween(at(0), at(7))).toBe(5);
  });

  it("does not let a weekend alone trip a 3-day threshold", () => {
    // Thursday afternoon to Sunday morning spans Fri+Sat: no working days.
    const thursday = at(4);
    const sunday = at(7);
    expect(workingDaysBetween(thursday, sunday)).toBeLessThan(NO_SPRINT_GAP_DAYS);
  });

  it("scales to long gaps without drifting", () => {
    expect(workingDaysBetween(at(0), at(28))).toBe(20);
  });
});

describe("sprintVerdict", () => {
  const window = { startDate: new Date(at(0)), endDate: new Date(at(10)) };

  it("is on track when completion keeps pace with the calendar", () => {
    const v = sprintVerdict(
      { ...window, committed: 10, added: 0, done: 5 },
      at(5),
    );
    expect(v.state).toBe("on_track");
    expect(v.remaining).toBe(5);
    expect(v.daysRemaining).toBe(5);
  });

  it("tolerates trailing the calendar by up to the risk margin", () => {
    // Half the time gone, done just inside the margin.
    const v = sprintVerdict(
      { ...window, committed: 10, added: 0, done: 4 },
      at(5),
    );
    expect(0.5 - v.donePct).toBeLessThanOrEqual(RISK_MARGIN);
    expect(v.state).toBe("on_track");
  });

  it("flags at risk while days remain", () => {
    const v = sprintVerdict(
      { ...window, committed: 22, added: 6, done: 9 },
      at(9),
    );
    expect(v.state).toBe("at_risk");
    expect(v.remaining).toBe(19);
    expect(v.daysRemaining).toBe(1);
  });

  it("counts added tasks against the total, not the promise", () => {
    const v = sprintVerdict(
      { ...window, committed: 10, added: 6, done: 10 },
      at(5),
    );
    expect(v.committed).toBe(10);
    expect(v.added).toBe(6);
    expect(v.remaining).toBe(6);
  });

  it("turns overdue once the end date passes with work open", () => {
    const v = sprintVerdict(
      { ...window, committed: 10, added: 0, done: 8 },
      at(13),
    );
    expect(v.state).toBe("overdue");
    expect(v.daysRemaining).toBe(-3);
  });

  it("is never late once everything is done, however long it sits open", () => {
    const v = sprintVerdict(
      { ...window, committed: 10, added: 0, done: 10 },
      at(40),
    );
    expect(v.state).toBe("on_track");
    expect(v.remaining).toBe(0);
  });

  it("survives an empty sprint and a zero-length window", () => {
    expect(
      sprintVerdict({ ...window, committed: 0, added: 0, done: 0 }, at(5)).state,
    ).toBe("on_track");
    expect(
      sprintVerdict(
        {
          startDate: new Date(at(3)),
          endDate: new Date(at(3)),
          committed: 4,
          added: 0,
          done: 4,
        },
        at(3),
      ).state,
    ).toBe("on_track");
  });
});

describe("projectSignals", () => {
  const base: ProjectAttentionInput = {
    activeSprint: null,
    unstartedSprint: null,
    lastActivityAt: null,
    lastSprintEndedAt: null,
    createdAt: new Date(at(0)),
  };

  it("says nothing about a healthy project", () => {
    const signals = projectSignals(
      {
        ...base,
        activeSprint: {
          name: "Sprint 4",
          startDate: new Date(at(0)),
          endDate: new Date(at(10)),
          committed: 10,
          added: 0,
          done: 5,
        },
        lastActivityAt: new Date(at(5) - 60 * 60 * 1000),
      },
      at(5),
    );
    expect(signals).toEqual([]);
  });

  it("reports a planning gap in working days", () => {
    const signals = projectSignals(
      { ...base, lastSprintEndedAt: new Date(at(0)), lastActivityAt: new Date(at(0)) },
      at(7),
    );
    const gap = signals.find((s) => s.type === "no_sprint");
    expect(gap).toBeDefined();
    expect(gap!.message).toBe("No sprint for 5 working days");
    expect(gap!.tier).toBe("unwatched");
  });

  it("falls back to project age when a project never had a sprint", () => {
    const signals = projectSignals({ ...base, createdAt: new Date(at(0)) }, at(14));
    expect(signals.some((s) => s.type === "no_sprint")).toBe(true);
  });

  it("does not report a planning gap while a sprint is running", () => {
    const signals = projectSignals(
      {
        ...base,
        activeSprint: {
          name: "Sprint 4",
          startDate: new Date(at(0)),
          endDate: new Date(at(10)),
          committed: 10,
          added: 0,
          done: 5,
        },
        lastSprintEndedAt: new Date(at(-30)),
        lastActivityAt: new Date(at(5)),
      },
      at(5),
    );
    expect(signals.some((s) => s.type === "no_sprint")).toBe(false);
  });

  it("catches a sprint that was queued and never started", () => {
    const signals = projectSignals(
      {
        ...base,
        unstartedSprint: { name: "Sprint 5", startDate: new Date(at(0)) },
        lastActivityAt: new Date(at(13)),
        lastSprintEndedAt: new Date(at(13)),
      },
      at(14),
    );
    const never = signals.find((s) => s.type === "sprint_never_started");
    expect(never).toBeDefined();
    expect(never!.message).toContain("Sprint 5");
  });

  it("notices a project nobody has touched", () => {
    const signals = projectSignals(
      { ...base, lastActivityAt: new Date(at(0)) },
      at(QUIET_DAYS + 2),
    );
    expect(signals.some((s) => s.type === "project_quiet")).toBe(true);
  });

  it("passes client blockers and stuck tasks through", () => {
    const signals = projectSignals(
      {
        ...base,
        activeSprint: {
          name: "Sprint 4",
          startDate: new Date(at(0)),
          endDate: new Date(at(10)),
          committed: 10,
          added: 0,
          done: 5,
        },
        lastActivityAt: new Date(at(5)),
        clientBlockedCount: 3,
        worstStuckMs: CRITICAL_LATE_MS + DAY_MS,
      },
      at(5),
    );
    expect(signals.find((s) => s.type === "client_blocked")!.message).toBe(
      "3 tasks waiting on the client",
    );
    expect(signals.some((s) => s.type === "task_stuck")).toBe(true);
  });

  it("returns its own signals worst-tier first", () => {
    const signals = projectSignals(
      {
        ...base,
        activeSprint: {
          name: "Sprint 4",
          startDate: new Date(at(0)),
          endDate: new Date(at(10)),
          committed: 20,
          added: 0,
          done: 2,
        },
        lastActivityAt: new Date(at(0)),
        clientBlockedCount: 1,
      },
      at(9),
    );
    expect(signals[0].type).toBe("sprint_at_risk");
    expect(signals.map((s) => s.rank)).toEqual(
      [...signals.map((s) => s.rank)].sort((a, b) => a - b),
    );
  });
});

describe("ordering", () => {
  function sig(rank: number, magnitude: number): AttentionSignal {
    return {
      type: "no_sprint",
      tier: "unwatched",
      rank,
      magnitude,
      message: "",
    };
  }

  it("puts a fixable sprint above one that already missed", () => {
    const atRisk = { name: "A", signals: [sig(TIER_RANK.recoverable, 1)] };
    const missed = { name: "B", signals: [sig(TIER_RANK.missed, 99)] };
    expect([missed, atRisk].sort(compareProjects)[0]).toBe(atRisk);
  });

  it("puts drift above lateness", () => {
    const quiet = { name: "A", signals: [sig(TIER_RANK.unwatched, 4)] };
    const overdue = { name: "B", signals: [sig(TIER_RANK.missed, 30)] };
    expect([overdue, quiet].sort(compareProjects)[0]).toBe(quiet);
  });

  it("breaks ties inside a tier by magnitude", () => {
    const mild = { name: "A", signals: [sig(TIER_RANK.unwatched, 3)] };
    const severe = { name: "B", signals: [sig(TIER_RANK.unwatched, 12)] };
    expect([mild, severe].sort(compareProjects)[0]).toBe(severe);
  });

  it("ranks a project by its worst signal, not its first", () => {
    const mixed = [sig(TIER_RANK.chronic, 50), sig(TIER_RANK.recoverable, 1)];
    expect(projectRank(mixed).rank).toBe(TIER_RANK.recoverable);
  });

  it("sinks healthy projects to the bottom", () => {
    const healthy = { name: "A", signals: [] };
    const chronic = { name: "B", signals: [sig(TIER_RANK.chronic, 1)] };
    expect([healthy, chronic].sort(compareProjects)).toEqual([chronic, healthy]);
  });

  it("falls back to name so the order is stable between loads", () => {
    const a = { name: "Alpha", signals: [] };
    const b = { name: "Beta", signals: [] };
    expect([b, a].sort(compareProjects)).toEqual([a, b]);
  });

  it("orders signals worst-tier first, then by magnitude", () => {
    const rows = [sig(2, 1), sig(0, 5), sig(0, 9)];
    expect(rows.sort(compareSignals).map((s) => [s.rank, s.magnitude])).toEqual([
      [0, 9],
      [0, 5],
      [2, 1],
    ]);
  });
});

describe("sprintOutcome", () => {
  it("scores the promise, not the total", () => {
    const out = sprintOutcome([
      { stage: "DONE", unplannedInSprint: false },
      { stage: "DONE", unplannedInSprint: false },
      { stage: "IN_DEVELOPMENT", unplannedInSprint: false },
      { stage: "DONE", unplannedInSprint: false },
    ]);
    expect(out.committed).toBe(4);
    expect(out.committedDone).toBe(3);
    expect(out.reliability).toBeCloseTo(0.75);
  });

  it("reports added work without letting it inflate reliability", () => {
    const out = sprintOutcome([
      { stage: "DONE", unplannedInSprint: false },
      { stage: "TODO", unplannedInSprint: false },
      { stage: "DONE", unplannedInSprint: true },
      { stage: "DONE", unplannedInSprint: true },
    ]);
    expect(out.committed).toBe(2);
    expect(out.added).toBe(2);
    expect(out.reliability).toBeCloseTo(0.5);
  });

  it("treats a sprint that promised nothing as kept", () => {
    expect(sprintOutcome([]).reliability).toBe(1);
    expect(
      sprintOutcome([{ stage: "DONE", unplannedInSprint: true }]).reliability,
    ).toBe(1);
  });

  it("counts only DONE as delivered", () => {
    const out = sprintOutcome([
      { stage: "INTERNAL_REVIEW", unplannedInSprint: false },
      { stage: "BACKLOG", unplannedInSprint: false },
    ]);
    expect(out.committedDone).toBe(0);
    expect(out.reliability).toBe(0);
  });
});

describe("bucketing", () => {
  function sig(tier: AttentionTier, magnitude = 1): AttentionSignal {
    return {
      type: "no_sprint",
      tier,
      rank: TIER_RANK[tier],
      magnitude,
      message: `${tier} problem`,
    };
  }

  it("calls a project with no signals healthy", () => {
    expect(projectBucket([])).toBe("healthy");
  });

  it("files a project under its worst signal", () => {
    expect(projectBucket([sig("chronic"), sig("recoverable")])).toBe(
      "recoverable",
    );
    expect(projectBucket([sig("missed"), sig("unwatched")])).toBe("unwatched");
  });

  it("counts each project once, however many problems it has", () => {
    const noisy = { name: "Noisy", signals: [sig("unwatched"), sig("chronic")] };
    const quiet = { name: "Quiet", signals: [sig("unwatched")] };

    const groups = bucketProjects([noisy, quiet]);
    const total = groups.reduce((sum, g) => sum + g.projects.length, 0);
    expect(total).toBe(2);
    expect(groups.find((g) => g.bucket === "unwatched")!.projects).toHaveLength(2);
    expect(groups.some((g) => g.bucket === "chronic")).toBe(false);
  });

  it("drops empty buckets and keeps severity order", () => {
    const groups = bucketProjects([
      { name: "H", signals: [] },
      { name: "A", signals: [sig("recoverable")] },
      { name: "M", signals: [sig("missed")] },
    ]);
    expect(groups.map((g) => g.bucket)).toEqual([
      "recoverable",
      "missed",
      "healthy",
    ]);
  });

  it("sorts projects inside a bucket worst first", () => {
    const mild = { name: "Mild", signals: [sig("unwatched", 2)] };
    const severe = { name: "Severe", signals: [sig("unwatched", 40)] };
    const groups = bucketProjects([mild, severe]);
    expect(groups[0].projects.map((p) => p.name)).toEqual(["Severe", "Mild"]);
  });

  it("labels every bucket it can produce", () => {
    for (const bucket of BUCKET_ORDER) {
      expect(BUCKET_LABELS[bucket]).toBeTruthy();
    }
  });
});

describe("stageGroup", () => {
  it("folds the four not-started stages into one", () => {
    for (const stage of ["BACKLOG", "PLANNED", "NEXT", "TODO"]) {
      expect(stageGroup(stage)).toBe("todo");
    }
  });

  it("treats every finished stage as done", () => {
    for (const stage of ["DONE", "COMPLETED", "SHIPPED"]) {
      expect(stageGroup(stage)).toBe("done");
      expect(isDoneStage(stage)).toBe(true);
    }
  });

  it("keeps the two working stages apart", () => {
    expect(stageGroup("IN_DEVELOPMENT")).toBe("in_development");
    expect(stageGroup("INTERNAL_REVIEW")).toBe("internal_review");
    expect(isDoneStage("IN_DEVELOPMENT")).toBe(false);
  });

  it("files an unknown stage as not started rather than dropping it", () => {
    expect(stageGroup("SOMETHING_NEW")).toBe("todo");
  });

  it("labels and orders every group", () => {
    expect(STAGE_GROUP_ORDER).toHaveLength(4);
    for (const group of STAGE_GROUP_ORDER) {
      expect(STAGE_GROUP_LABELS[group]).toBeTruthy();
      expect(emptyStageCounts()[group]).toBe(0);
    }
  });
});

describe("deliveryStatus", () => {
  function sig(tier: AttentionTier): AttentionSignal {
    return {
      type: "no_sprint",
      tier,
      rank: TIER_RANK[tier],
      magnitude: 1,
      message: "",
    };
  }

  it("calls a project with nothing flagged on track", () => {
    expect(deliveryStatus([])).toBe("on_track");
  });

  it("only calls a project off track once nothing can be done today", () => {
    expect(deliveryStatus([sig("missed")])).toBe("off_track");
    expect(deliveryStatus([sig("chronic")])).toBe("off_track");
  });

  it("keeps a still-fixable problem at risk rather than off track", () => {
    expect(deliveryStatus([sig("recoverable")])).toBe("at_risk");
    expect(deliveryStatus([sig("unwatched")])).toBe("at_risk");
    expect(deliveryStatus([sig("blocked")])).toBe("at_risk");
  });

  it("is driven by the worst signal, not the first", () => {
    expect(deliveryStatus([sig("blocked"), sig("missed")])).toBe("off_track");
  });

  it("labels every status", () => {
    for (const status of ["on_track", "at_risk", "off_track"] as const) {
      expect(DELIVERY_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
