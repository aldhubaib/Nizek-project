import { describe, expect, it } from "vitest";
import {
  overlayPlanningTaskAssignees,
  planningTaskIdsFromHtml,
  sprintPlanningDocHtml,
  sprintTaskNodeHtml,
  stripPlanningTaskAssignees,
  stripSprintDocKind,
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
    stage: "BACKLOG",
    estimatedMinutes: extra?.estimatedMinutes ?? null,
    sprintCount: 1,
    assignee: extra?.assignee ?? null,
    questions: extra?.questions ?? [],
    unplanned: extra?.unplanned,
    ...(extra?.decision !== undefined ? { decision: extra.decision } : {}),
    ...(extra?.risk !== undefined ? { risk: extra.risk } : {}),
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

  // The reported bug. A task dragged out of Next kept its row, and because a
  // departed task has no estimate, assignee, Decision or Risk, that row made
  // the Start sprint button permanently refuse over work not in the sprint.
  it("removes the row for a task that has left the sprint", () => {
    const saved = sprintPlanningDocHtml([task("a", "One"), task("b", "Two")], info);
    const synced = syncPlanningDocTasks(saved, [task("a", "One")]);
    expect(planningTaskIdsFromHtml(synced)).toEqual(["a"]);
    expect(synced).not.toContain("Two");
  });

  it("adds and removes in the same pass", () => {
    const saved = sprintPlanningDocHtml([task("a", "One"), task("b", "Two")], info);
    const synced = syncPlanningDocTasks(saved, [task("a", "One"), task("c", "Three")]);
    expect(planningTaskIdsFromHtml(synced).sort()).toEqual(["a", "c"]);
  });

  it("restores the placeholder when the last task leaves", () => {
    const saved = sprintPlanningDocHtml([task("a", "One")], info);
    const synced = syncPlanningDocTasks(saved, []);
    expect(planningTaskIdsFromHtml(synced)).toEqual([]);
    expect(synced).toContain("No tasks in this sprint yet.");
  });

  it("leaves a node it cannot parse rather than deleting it", () => {
    const saved = `${sprintPlanningDocHtml([task("a", "One")], info)}<div data-type="sprint-task"><br></div>`;
    const synced = syncPlanningDocTasks(saved, [task("a", "One")]);
    expect(synced).toContain('data-type="sprint-task"><br></div>');
  });

  it("seeds Decision and Risk from the server rather than blank", () => {
    const saved = sprintPlanningDocHtml([], info);
    const synced = syncPlanningDocTasks(saved, [
      task("a", "One", { decision: "Ship it", risk: "Vendor may slip" }),
    ]);
    expect(synced).toContain('data-decision="Ship it"');
    expect(synced).toContain('data-risk="Vendor may slip"');
  });

  it("overlays Decision and Risk onto a node that already exists", () => {
    const saved = sprintTaskNodeHtml(task("a", "One"));
    const synced = syncPlanningDocTasks(saved, [
      task("a", "One", { decision: "Agreed", risk: "None" }),
    ]);
    expect(synced).toContain('data-decision="Agreed"');
    expect(synced).toContain('data-risk="None"');
  });

  it("escapes Decision and Risk so quotes cannot break out of the attribute", () => {
    const synced = syncPlanningDocTasks(sprintTaskNodeHtml(task("a", "One")), [
      task("a", "One", { decision: 'He said "go"', risk: "a < b & c" }),
    ]);
    expect(synced).toContain("&quot;go&quot;");
    expect(synced).toContain("&amp;");
    expect(planningTaskIdsFromHtml(synced)).toEqual(["a"]);
  });

  it("does not store Decision and Risk twice in one node", () => {
    const synced = syncPlanningDocTasks(sprintTaskNodeHtml(task("a", "One")), [
      task("a", "One", { decision: "Agreed", risk: "None" }),
    ]);
    const embedded = synced.match(/data-task="([^"]*)"/)?.[1] ?? "";
    expect(embedded).not.toContain("decision");
    expect(embedded).not.toContain("risk");
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

  it("strips the suffix the planning and review documents were told apart by", () => {
    expect(stripSprintDocKind("Sprint 16 planning")).toBe("Sprint 16");
    expect(stripSprintDocKind("Sprint 16 review")).toBe("Sprint 16");
    expect(stripSprintDocKind("Q3 Launch")).toBe("Q3 Launch");
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

// A client reading a sprint document must not be able to find a real employee
// name in it. Hiding the avatar is a display choice; these are about the bytes.
describe("stripping assignees for a client viewer", () => {
  const assigned = task("a", "One", {
    estimatedMinutes: 90,
    assignee: { id: "u1", name: "Ada Lovelace", imageUrl: "https://example.test/ada.png" },
    questions: [{ question: "Scope?", answer: "Checkout only" }],
  });

  it("removes the name and photo from the saved document", () => {
    const html = sprintPlanningDocHtml([assigned], info);
    expect(html).toContain("Ada Lovelace");

    const stripped = stripPlanningTaskAssignees(html);
    expect(stripped).not.toContain("Ada Lovelace");
    expect(stripped).not.toContain("ada.png");
  });

  it("keeps everything the client is meant to read", () => {
    const stripped = stripPlanningTaskAssignees(sprintPlanningDocHtml([assigned], info));
    expect(planningTaskIdsFromHtml(stripped)).toEqual(["a"]);
    expect(stripped).toContain("One");
    expect(stripped).toContain("90");
    expect(stripped).toContain("Checkout only");
  });

  it("leaves a document with no assignees untouched", () => {
    const html = sprintPlanningDocHtml([task("a", "One"), task("b", "Two")], info);
    expect(stripPlanningTaskAssignees(html)).toBe(html);
  });

  it("is safe to run twice", () => {
    const once = stripPlanningTaskAssignees(sprintPlanningDocHtml([assigned], info));
    expect(stripPlanningTaskAssignees(once)).toBe(once);
  });
});
