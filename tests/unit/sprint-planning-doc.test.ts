import { describe, expect, it } from "vitest";
import {
  overlayPlanningTaskAssignees,
  planningTaskIdsFromHtml,
  sprintDocTitle,
  sprintPlanningDocHtml,
  sprintTaskNodeHtml,
  summarizeSprintTasks,
  syncPlanningDocTasks,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";

function task(id: string, title: string, extra?: Partial<SprintPlanningTask>): SprintPlanningTask {
  return {
    id,
    code: `F-${id}`,
    title,
    taskType: "FEATURE",
    stage: "NEW_REQUEST",
    estimatedMinutes: extra?.estimatedMinutes ?? null,
    sprintCount: 1,
    assignee: extra?.assignee ?? null,
    questions: extra?.questions ?? [],
    unplanned: extra?.unplanned,
  };
}

const info: SprintPlanningInfo = {
  sprintId: "sprint-1",
  sprintName: "Sprint 1",
  status: "PLANNED",
  documentDate: "",
  documentDateIso: "",
  startDate: "",
  endDate: "",
  startIso: "",
  endIso: "",
  workingDays: "",
};

describe("sprint planning document tasks", () => {
  it("embeds every sprint task when the doc is first created", () => {
    const html = sprintPlanningDocHtml(
      [task("a", "One"), task("b", "Two"), task("c", "Three")],
      info,
    );
    expect(planningTaskIdsFromHtml(html)).toEqual(["a", "b", "c"]);
  });

  it("inserts tasks that were added to the sprint after the planning note was saved", () => {
    const saved = sprintPlanningDocHtml([task("a", "One")], info);
    const live = [
      task("a", "One"),
      task("b", "Two"),
      task("c", "Three"),
    ];
    const synced = syncPlanningDocTasks(saved, live);
    expect(planningTaskIdsFromHtml(synced)).toEqual(["a", "b", "c"]);
  });

  it("replaces the empty-sprint placeholder with the live task list", () => {
    const saved = sprintPlanningDocHtml([], info);
    const synced = syncPlanningDocTasks(saved, [task("a", "One"), task("b", "Two")]);
    expect(synced).not.toContain("No tasks in this sprint yet.");
    expect(planningTaskIdsFromHtml(synced)).toEqual(["a", "b"]);
  });

  it("is idempotent when every live task is already in the document", () => {
    const html = sprintPlanningDocHtml([task("a", "One"), task("b", "Two")], info);
    expect(syncPlanningDocTasks(html, [task("a", "One"), task("b", "Two")])).toBe(
      overlayPlanningTaskAssignees(html, [task("a", "One"), task("b", "Two")]),
    );
  });

  it("keeps live assignee and estimate on existing nodes", () => {
    const saved = sprintTaskNodeHtml(task("a", "One"));
    const live = [
      task("a", "One", {
        estimatedMinutes: 90,
        assignee: { id: "u1", name: "Ada", imageUrl: null },
      }),
    ];
    const synced = syncPlanningDocTasks(saved, live);
    expect(synced).toContain("Ada");
    expect(synced).toContain("90");
  });
});

describe("summarizeSprintTasks", () => {
  it("counts types and sums estimates", () => {
    expect(
      summarizeSprintTasks([
        { taskType: "FEATURE", estimatedMinutes: 60 },
        { taskType: "FEATURE", estimatedMinutes: 30 },
        { taskType: "ENHANCEMENT", estimatedMinutes: 20 },
        { taskType: "BUG", estimatedMinutes: 10 },
        { taskType: "REPORTED_BUG", estimatedMinutes: null },
        { taskType: "DESIGN", estimatedMinutes: 15 },
      ]),
    ).toEqual({
      businessCases: 2,
      enhancements: 1,
      bugs: 2,
      design: 1,
      totalMinutes: 135,
      taskCount: 6,
      completed: 0,
      uncompleted: 0,
    });
  });

  it("counts completed and uncompleted by stage", () => {
    expect(
      summarizeSprintTasks([
        { taskType: "FEATURE", stage: "DONE", estimatedMinutes: 60 },
        { taskType: "BUG", stage: "IN_DEVELOPMENT", estimatedMinutes: 10 },
        { taskType: "ENHANCEMENT", stage: "DONE", estimatedMinutes: 20 },
      ]),
    ).toMatchObject({ completed: 2, uncompleted: 1, taskCount: 3 });
  });

  it("builds a review title from the planning name", () => {
    expect(sprintDocTitle("Sprint 16 planning", "review")).toBe("Sprint 16 review");
    expect(sprintDocTitle("Q3 Launch", "review")).toBe("Q3 Launch review");
    expect(sprintDocTitle("Sprint 16 review", "planning")).toBe("Sprint 16 planning");
  });

  it("returns zeros for an empty sprint", () => {
    expect(summarizeSprintTasks([])).toEqual({
      businessCases: 0,
      enhancements: 0,
      bugs: 0,
      design: 0,
      totalMinutes: 0,
      taskCount: 0,
      completed: 0,
      uncompleted: 0,
    });
  });
});
