import { describe, expect, it } from "vitest";
import {
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
});
