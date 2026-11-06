import { describe, expect, it } from "vitest";

import type { StageVisit, TaskHistoryActivity } from "@/actions/task-history";
import { historyLines, historySummaryText } from "@/next-ui/screens/projects/task-history";

const omar = { id: "u1", name: "Omar", imageUrl: null };

const visit = (over: Partial<StageVisit>): StageVisit => ({
  id: "v",
  stage: "BACKLOG",
  fromStage: null,
  enteredAt: new Date("2026-02-01T09:00:00Z"),
  exitedAt: null,
  durationMs: 0,
  ongoing: false,
  source: "USER_MOVE",
  reason: null,
  actor: omar,
  sprintId: null,
  sprintName: null,
  assignee: null,
  ...over,
});

const activity = (over: Partial<TaskHistoryActivity>): TaskHistoryActivity => ({
  id: "a",
  action: "updated",
  field: "priority",
  oldValue: "NORMAL",
  newValue: "HIGH",
  createdAt: new Date("2026-02-02T10:00:00Z"),
  user: omar,
  ...over,
});

describe("historyLines", () => {
  it("tells the stages and the changes newest first, with how long each stage lasted", () => {
    const lines = historyLines(
      [
        visit({ id: "1", source: "TASK_CREATED", stage: "BACKLOG", enteredAt: new Date("2026-02-01T09:00:00Z"), durationMs: 2 * 86_400_000 }),
        visit({ id: "2", source: "USER_MOVE", fromStage: "BACKLOG", stage: "TODO", enteredAt: new Date("2026-02-03T09:00:00Z"), durationMs: 3 * 3_600_000, ongoing: true }),
      ],
      [activity({ id: "9" })],
    );
    expect(lines.map((l) => l.text)).toEqual(["Omar moved Backlog → Todo", "Omar changed priority from NORMAL to HIGH", "Omar created this task in Backlog"]);
    expect(lines.map((l) => l.kind)).toEqual(["stage", "change", "stage"]);
    expect(lines[0].stay).toBe("3h 0m so far");
    expect(lines[2].stay).toBe("2d 0h");
    expect(lines[1].stay).toBeUndefined();
  });

  it("leaves out the activity rows that only repeat a stage move", () => {
    const lines = historyLines([], [activity({ id: "1", action: "moved", field: "stage" }), activity({ id: "2", action: "created", field: null }), activity({ id: "3", action: "answered", field: null })]);
    expect(lines.map((l) => l.text)).toEqual(["Omar updated an answer"]);
  });

  it("accepts dates that arrived as strings", () => {
    const lines = historyLines([visit({ id: "1", enteredAt: "2026-02-01T09:00:00Z" as unknown as Date })], []);
    expect(lines[0].at.getTime()).toBe(new Date("2026-02-01T09:00:00Z").getTime());
  });
});

describe("historySummaryText", () => {
  const name = (s: string | null) => (s === "IN_DEVELOPMENT" ? "In development" : String(s));
  it("says where the task is and for how long, and how often it went back", () => {
    expect(historySummaryText({ currentStage: "IN_DEVELOPMENT", currentStageMs: 90 * 60_000, regressions: 0 }, name)).toBe("In In development for 1h 30m");
    expect(historySummaryText({ currentStage: "IN_DEVELOPMENT", currentStageMs: 60_000, regressions: 1 }, name)).toBe("In In development for 1m 0s · sent back once");
    expect(historySummaryText({ currentStage: "IN_DEVELOPMENT", currentStageMs: 60_000, regressions: 3 }, name)).toBe("In In development for 1m 0s · sent back 3 times");
  });
  it("says only the regressions when the task has no stage", () => {
    expect(historySummaryText({ currentStage: null, currentStageMs: 0, regressions: 2 }, name)).toBe("sent back 2 times");
  });
});
