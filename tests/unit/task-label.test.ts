import { describe, expect, it } from "vitest";
import {
  projectHrefForTaskReturn,
  sprintTabForStatus,
  taskDetailHref,
} from "@/lib/task-label";

describe("sprintTabForStatus", () => {
  it("sends an active sprint to the sprints tab", () => {
    expect(sprintTabForStatus("ACTIVE")).toBe("sprints");
  });

  it("sends closed sprints to the completed tab", () => {
    expect(sprintTabForStatus("COMPLETED")).toBe("completed");
    expect(sprintTabForStatus("SHIPPED")).toBe("completed");
  });

  it("sends planned work to the backlog", () => {
    expect(sprintTabForStatus("PLANNED")).toBe("board");
  });
});

describe("taskDetailHref", () => {
  it("appends a return tab when opening from the project", () => {
    expect(taskDetailHref("p1", "t1", "sprints")).toBe(
      "/dashboard/projects/p1/tasks/t1?from=sprints",
    );
  });

  it("omits from when the source is not a project tab", () => {
    expect(taskDetailHref("p1", "t1", "note")).toBe(
      "/dashboard/projects/p1/tasks/t1",
    );
  });
});

describe("projectHrefForTaskReturn", () => {
  it("prefers the tab the user came from", () => {
    expect(projectHrefForTaskReturn("p1", "sprints", "PLANNED")).toBe(
      "/dashboard/projects/p1?tab=sprints",
    );
  });

  it("falls back to the task's current sprint", () => {
    expect(projectHrefForTaskReturn("p1", null, "ACTIVE")).toBe(
      "/dashboard/projects/p1?tab=sprints",
    );
  });

  it("returns the backlog when there is no sprint", () => {
    expect(projectHrefForTaskReturn("p1")).toBe("/dashboard/projects/p1");
  });
});
