import { describe, expect, it } from "vitest";
import {
  comparePlannedSprints,
  isClosedSprint,
  isCurrentSprintStatus,
  isUnstartedSprint,
  sprintBoardColumn,
} from "@/lib/sprint-status";

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
