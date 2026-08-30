import { describe, expect, it } from "vitest";
import {
  compareClosedSprints,
  comparePlannedSprints,
  isClosedSprint,
  isCurrentSprintStatus,
  isUnstartedSprint,
  sprintBoardColumn,
  sprintDepartureToRecord,
} from "@/lib/sprint-status";

describe("sprintDepartureToRecord", () => {
  it("records the sprint a task is moved out of", () => {
    expect(
      sprintDepartureToRecord({ sprintId: "s1", status: "ACTIVE" }, "s2"),
    ).toBe("s1");
  });

  it("records a removal from a sprint, not just a move to another", () => {
    expect(
      sprintDepartureToRecord({ sprintId: "s1", status: "PLANNED" }, null),
    ).toBe("s1");
  });

  it("records nothing when the task was not in a sprint", () => {
    expect(sprintDepartureToRecord({ sprintId: null, status: null }, "s2")).toBeNull();
  });

  it("records nothing when the sprint is unchanged", () => {
    // Re-assigning the same sprint happens when only the estimate is edited.
    expect(
      sprintDepartureToRecord({ sprintId: "s1", status: "ACTIVE" }, "s1"),
    ).toBeNull();
  });

  it("leaves a closed sprint's own snapshot alone", () => {
    // A DONE task stays attached to a sprint that ended, and that snapshot
    // carries the reason its review gave. Overwriting it would lose that.
    for (const status of ["COMPLETED", "PARTIALLY_COMPLETED", "SHIPPED"]) {
      expect(sprintDepartureToRecord({ sprintId: "s1", status }, "s2")).toBeNull();
    }
  });
});

describe("sprintBoardColumn", () => {
  it("puts unstarted sprints in Planned or Next", () => {
    expect(sprintBoardColumn("PLANNED")).toBe("PLANNED");
    expect(sprintBoardColumn("NEXT")).toBe("NEXT");
    expect(isUnstartedSprint("PLANNED")).toBe(true);
    expect(isUnstartedSprint("NEXT")).toBe(true);
    expect(isUnstartedSprint("ACTIVE")).toBe(false);
  });

  it("puts the active sprint in In Progress", () => {
    expect(sprintBoardColumn("ACTIVE")).toBe("ACTIVE");
  });

  it("groups completed and partial into Completed, shipped on its own", () => {
    expect(sprintBoardColumn("COMPLETED")).toBe("COMPLETED");
    expect(sprintBoardColumn("PARTIALLY_COMPLETED")).toBe("COMPLETED");
    expect(sprintBoardColumn("SHIPPED")).toBe("SHIPPED");
    expect(isClosedSprint("COMPLETED")).toBe(true);
    expect(isClosedSprint("SHIPPED")).toBe(true);
    expect(isClosedSprint("ACTIVE")).toBe(false);
  });

  it("counts Planned, Next, and Active as the current sprint", () => {
    expect(isCurrentSprintStatus("PLANNED")).toBe(true);
    expect(isCurrentSprintStatus("NEXT")).toBe(true);
    expect(isCurrentSprintStatus("ACTIVE")).toBe(true);
    expect(isCurrentSprintStatus("COMPLETED")).toBe(false);
    expect(isCurrentSprintStatus("SHIPPED")).toBe(false);
  });

  it("orders planned sprints by sortOrder, then Next, then start date", () => {
    const a = { sortOrder: 1, status: "PLANNED", startDate: "2026-01-01" };
    const b = { sortOrder: 0, status: "NEXT", startDate: "2026-06-01" };
    expect(comparePlannedSprints(b, a)).toBeLessThan(0);
    expect(comparePlannedSprints({ ...a, sortOrder: 0 }, { ...b, sortOrder: 0 })).toBeGreaterThan(0);
  });
});

describe("compareClosedSprints", () => {
  it("puts the newest sprint review completion first", () => {
    const older = { completedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" };
    const newer = { completedAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" };
    expect(compareClosedSprints(newer, older)).toBeLessThan(0);
  });

  it("falls back to updatedAt when completedAt is missing", () => {
    const withReview = { completedAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    const legacy = { completedAt: null, updatedAt: "2026-04-01T00:00:00.000Z" };
    expect(compareClosedSprints(legacy, withReview)).toBeLessThan(0);
  });

  it("prefers the sprint review document date over completedAt", () => {
    const olderReview = {
      reviewDate: "2026-01-15",
      completedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const newerReview = {
      reviewDate: "2026-04-01",
      completedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(compareClosedSprints(newerReview, olderReview)).toBeLessThan(0);
  });
});
