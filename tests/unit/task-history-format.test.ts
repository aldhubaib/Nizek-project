import { describe, it, expect } from "vitest";
import {
  describeStageVisit,
  describeActivity,
  formatDuration,
  isStageEcho,
  orderStages,
} from "@/lib/task-history-format";
import type { StageVisit, TaskHistoryActivity } from "@/actions/task-history";

const base: StageVisit = {
  id: "l1",
  stage: "IN_DEVELOPMENT",
  fromStage: "TODO",
  enteredAt: new Date("2026-07-01T10:00:00Z"),
  exitedAt: null,
  durationMs: 0,
  ongoing: true,
  source: "USER_MOVE",
  reason: null,
  actor: { id: "u1", name: "Ahmed", imageUrl: null },
  sprintId: "s1",
  sprintName: "Sprint 21",
  assignee: null,
};

const visit = (over: Partial<StageVisit>): StageVisit => ({ ...base, ...over });

describe("describeStageVisit", () => {
  it("names the person for the moves a person makes", () => {
    expect(describeStageVisit(visit({}))).toBe("Ahmed moved Todo → In Development");
    expect(describeStageVisit(visit({ source: "TASK_CREATED", fromStage: null, stage: "BACKLOG" })))
      .toBe("Ahmed created this task in Backlog");
    expect(describeStageVisit(visit({ source: "DECLINE", fromStage: "INTERNAL_REVIEW" })))
      .toBe("Ahmed declined at Internal Review → back to In Development");
  });

  it("names the sprint for the moves the sprint layer makes", () => {
    expect(describeStageVisit(visit({ source: "SPRINT_START", stage: "TODO", fromStage: "PLANNED" })))
      .toBe("Sprint 21 started → Todo (by Ahmed)");
    expect(
      describeStageVisit(
        visit({ source: "SPRINT_COMPLETE", stage: "BACKLOG", fromStage: "TODO", actor: null }),
      ),
    ).toBe("Sprint 21 completed → Backlog");
    expect(describeStageVisit(visit({ source: "SPRINT_SCHEDULE", stage: "PLANNED", fromStage: "BACKLOG" })))
      .toBe("Ahmed scheduled it into Sprint 21 → Planned");
  });

  it("says a backfilled row is a reconstruction rather than crediting anyone", () => {
    expect(describeStageVisit(visit({ source: "MIGRATION", stage: "DONE" })))
      .toBe("Recorded as Done when history was backfilled");
  });
});

describe("isStageEcho", () => {
  const activity = (over: Partial<TaskHistoryActivity>): TaskHistoryActivity => ({
    id: "a1",
    action: "moved",
    field: "stage",
    oldValue: "TODO",
    newValue: "IN_DEVELOPMENT",
    createdAt: new Date(),
    user: { id: "u1", name: "Ahmed", imageUrl: null },
    ...over,
  });

  it("drops the activity rows the lifecycle spine already covers", () => {
    expect(isStageEcho(activity({}))).toBe(true);
    expect(isStageEcho(activity({ action: "declined" }))).toBe(true);
    expect(isStageEcho(activity({ action: "created", field: null }))).toBe(true);
  });

  it("keeps the detail the spine does not record", () => {
    expect(isStageEcho(activity({ action: "assigned", field: "assignee" }))).toBe(false);
    expect(isStageEcho(activity({ action: "proof_of_work", field: null }))).toBe(false);
    expect(isStageEcho(activity({ action: "scheduled", field: "sprint" }))).toBe(false);
  });
});

describe("describeActivity", () => {
  const at = new Date();
  const user = { id: "u1", name: "Sara", imageUrl: null };

  it("reads scheduling as scheduling, which used to leave no trace at all", () => {
    expect(
      describeActivity({
        id: "a1", action: "scheduled", field: "sprint", oldValue: null,
        newValue: "Sprint 21", createdAt: at, user,
      }),
    ).toBe("Sara scheduled it into Sprint 21");
    expect(
      describeActivity({
        id: "a2", action: "unscheduled", field: "sprint", oldValue: "Sprint 21",
        newValue: null, createdAt: at, user,
      }),
    ).toBe("Sara removed it from Sprint 21");
  });
});

describe("formatting", () => {
  it("formats durations at the coarsest useful unit", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
    expect(formatDuration(50 * 60 * 60_000)).toBe("2d 2h");
  });

  it("lays stage chips out in lifecycle order regardless of input order", () => {
    expect(orderStages(["DONE", "BACKLOG", "IN_DEVELOPMENT", "SHIPPED"])).toEqual([
      "BACKLOG",
      "IN_DEVELOPMENT",
      "DONE",
      "SHIPPED",
    ]);
  });
});
