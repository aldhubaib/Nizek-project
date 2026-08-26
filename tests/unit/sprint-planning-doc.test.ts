import { describe, expect, it } from "vitest";
import {
  overlayPlanningTaskAssignees,
  planningTaskIdsFromHtml,
  sprintPlanningDocHtml,
  sprintTaskNodeHtml,
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
