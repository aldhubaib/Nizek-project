import { describe, expect, it } from "vitest";

import {
  activeSprint,
  activeSprintStages,
  formatFileSize,
  formatMinutes,
  roadmapLanes,
  sprintDates,
  sprintLanes,
  sprintTimeLeft,
  tasksOfSprint,
} from "@/next-ui/screens/projects/board-state";

const t = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  taskNumber: 1,
  taskType: "FEATURE",
  stage: "BACKLOG",
  order: 0,
  priority: "NORMAL",
  sprintId: null,
  isReadyForTransition: true,
  ...over,
});

const s = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  status,
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-03-14T00:00:00.000Z",
  sortOrder: 0,
  completedAt: null,
  reviewDate: null,
  updatedAt: "2026-03-01T00:00:00.000Z",
  taskCount: 0,
  ...over,
});

describe("the road map's lanes", () => {
  const sprints = [s("next", "NEXT"), s("plan", "PLANNED"), s("run", "ACTIVE")];

  it("puts a loose task in the backlog, or in Missing data while a mandatory answer is missing", () => {
    const lanes = roadmapLanes([t("a"), t("b", { isReadyForTransition: false }), t("c", { stage: "DONE" })], sprints);
    expect(lanes.backlog.map((x) => x.id)).toEqual(["a"]);
    expect(lanes.missing.map((x) => x.id)).toEqual(["b"]);
    expect(lanes.planned).toEqual([]);
    expect(lanes.next).toEqual([]);
  });

  it("puts a task in Planned or Next by its sprint, and keeps a running sprint's tasks out of the lanes", () => {
    const lanes = roadmapLanes(
      [
        t("p2", { sprintId: "plan", stage: "PLANNED", order: 2 }),
        t("p1", { sprintId: "plan", stage: "PLANNED", order: 1 }),
        t("n", { sprintId: "next", stage: "NEXT" }),
        t("r", { sprintId: "run", stage: "TODO" }),
        t("d", { sprintId: "plan", stage: "DONE" }),
      ],
      sprints,
    );
    expect(lanes.planned.map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(lanes.next.map((x) => x.id)).toEqual(["n"]);
    expect(lanes.backlog).toEqual([]);
    expect(tasksOfSprint([t("r", { sprintId: "run" })], "run").map((x) => x.id)).toEqual(["r"]);
  });

  it("groups sprints into lanes, finished ones newest first", () => {
    const lanes = sprintLanes([
      s("old", "COMPLETED", { completedAt: "2026-01-10T00:00:00.000Z" }),
      s("new", "PARTIALLY_COMPLETED", { completedAt: "2026-02-10T00:00:00.000Z" }),
      s("ship", "SHIPPED", { completedAt: "2025-12-01T00:00:00.000Z" }),
      s("run", "ACTIVE"),
    ]);
    expect(lanes.ACTIVE.map((x) => x.id)).toEqual(["run"]);
    expect(lanes.COMPLETED.map((x) => x.id)).toEqual(["new", "old"]);
    expect(lanes.SHIPPED.map((x) => x.id)).toEqual(["ship"]);
  });
});

describe("the active sprint", () => {
  it("is the one running sprint, with its tasks by stage and backlog ones counted as to do", () => {
    const sprints = [s("plan", "PLANNED"), s("run", "ACTIVE")];
    expect(activeSprint(sprints)?.id).toBe("run");
    expect(activeSprint([s("plan", "PLANNED")])).toBeNull();
    const stages = activeSprintStages(
      [
        t("a", { sprintId: "run", stage: "IN_DEVELOPMENT" }),
        t("b", { sprintId: "run", stage: "DONE" }),
        t("c", { sprintId: "run", stage: "BACKLOG" }),
        t("x", { sprintId: "plan", stage: "PLANNED" }),
      ],
      "run",
    );
    expect(stages.TODO.map((x) => x.id)).toEqual(["c"]);
    expect(stages.IN_DEVELOPMENT.map((x) => x.id)).toEqual(["a"]);
    expect(stages.INTERNAL_REVIEW).toEqual([]);
    expect(stages.DONE.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("the words", () => {
  it("writes sprint dates once with the year, and the time left", () => {
    expect(sprintDates(s("x", "ACTIVE"))).toBe("1 Mar – 14 Mar 2026");
    expect(sprintDates(s("x", "ACTIVE", { startDate: "2025-12-20T00:00:00.000Z", endDate: "2026-01-05T00:00:00.000Z" }))).toBe(
      "20 Dec 2025 – 5 Jan 2026",
    );
    const end = { endDate: "2026-03-14T12:00:00.000Z" };
    expect(sprintTimeLeft(end, new Date("2026-03-10T12:00:00.000Z"))).toBe("4 days left");
    expect(sprintTimeLeft(end, new Date("2026-03-13T12:00:00.000Z"))).toBe("1 day left");
    expect(sprintTimeLeft(end, new Date("2026-03-14T12:00:00.000Z"))).toBe("Ends today");
    expect(sprintTimeLeft(end, new Date("2026-03-16T12:00:00.000Z"))).toBe("Overdue by 2 days");
  });

  it("formats minutes and file sizes", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatFileSize(null)).toBe("Unknown size");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2_400_000)).toBe("2.3 MB");
  });
});
