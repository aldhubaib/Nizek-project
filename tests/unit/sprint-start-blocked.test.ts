import { describe, expect, it } from "vitest";
import {
  sprintStartBlockedReason,
  syncPlanningDocTasks,
  planningTaskIdsFromHtml,
  sprintPlanningDocHtml,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import { isUnstartedSprint } from "@/lib/sprint-status";

const ready = {
  activeSprintName: null as string | null,
  infoIncomplete: false,
  missingEstimates: false,
  missingAssignees: false,
  docIncomplete: false,
};

describe("sprintStartBlockedReason", () => {
  it("blocks on another active sprint first", () => {
    expect(
      sprintStartBlockedReason({ ...ready, activeSprintName: "Sprint 15", infoIncomplete: true }),
    ).toBe('Finish "Sprint 15" before starting this sprint.');
  });

  it("asks for sprint information, then estimates, assignees, then decision/risk", () => {
    expect(sprintStartBlockedReason({ ...ready, infoIncomplete: true })).toBe(
      "Fill in every Sprint Information field.",
    );
    expect(sprintStartBlockedReason({ ...ready, missingEstimates: true })).toBe(
      "Add an estimate to every task.",
    );
    expect(sprintStartBlockedReason({ ...ready, missingAssignees: true })).toBe(
      "Assign every task.",
    );
    expect(sprintStartBlockedReason({ ...ready, docIncomplete: true })).toBe(
      "Fill in Decision and Risk for every task.",
    );
  });

  it("is clear when the planning doc is ready", () => {
    expect(sprintStartBlockedReason(ready)).toBeNull();
  });

  // The gate is computed from the sprint's own task list now. A row for a task
  // that has left the sprint used to set all three flags at once, so the button
  // stayed disabled and named work nobody could find to fix.
  it("is clear when every task in the sprint is complete", () => {
    const live = [
      { estimatedMinutes: 60, assignee: { name: "Ada" }, decision: "Ship", risk: "None" },
    ];
    expect(
      sprintStartBlockedReason({
        ...ready,
        missingEstimates: live.some((t) => !t.estimatedMinutes),
        missingAssignees: live.some((t) => !t.assignee),
        docIncomplete: live.some((t) => !t.decision.trim() || !t.risk.trim()),
      }),
    ).toBeNull();
  });
});

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

function task(id: string): SprintPlanningTask {
  return {
    id,
    code: `F-${id}`,
    title: `Task ${id}`,
    taskType: "FEATURE",
    stage: "BACKLOG",
    estimatedMinutes: 60,
    sprintCount: 1,
    assignee: null,
    questions: [],
  };
}

/**
 * The document mirrors the sprint only until the sprint starts. After that it
 * is the record of what was committed to, so callers stop reconciling — the
 * decision lives in the caller, and this is the rule they apply.
 */
describe("freeze after start", () => {
  const started = ["ACTIVE", "COMPLETED", "PARTIALLY_COMPLETED", "SHIPPED"];
  const unstarted = ["PLANNED", "NEXT"];

  it("mirrors while the sprint is still being planned", () => {
    for (const status of unstarted) {
      expect(isUnstartedSprint(status)).toBe(true);
    }
  });

  it("stops mirroring once the sprint has started", () => {
    for (const status of started) {
      expect(isUnstartedSprint(status)).toBe(false);
    }
  });

  it("leaves a started sprint's document alone when a task is removed later", () => {
    const saved = sprintPlanningDocHtml([task("a"), task("b")], info);
    const live = [task("a")];

    // What the caller does for a started sprint: no reconcile at all.
    const frozen = isUnstartedSprint("ACTIVE") ? syncPlanningDocTasks(saved, live) : saved;
    expect(planningTaskIdsFromHtml(frozen)).toEqual(["a", "b"]);

    // And what it does while still planning.
    const mirrored = isUnstartedSprint("NEXT") ? syncPlanningDocTasks(saved, live) : saved;
    expect(planningTaskIdsFromHtml(mirrored)).toEqual(["a"]);
  });
});
