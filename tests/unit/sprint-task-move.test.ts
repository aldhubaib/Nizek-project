import { describe, expect, it } from "vitest";
import { fieldsClearedByMove } from "@/lib/sprint-task-move";

const ALL_FILLED = {
  hasDecision: true,
  hasRisk: true,
  hasEstimate: true,
  hasAssignee: true,
};

const NONE_FILLED = {
  hasDecision: false,
  hasRisk: false,
  hasEstimate: false,
  hasAssignee: false,
};

describe("fieldsClearedByMove: when to warn", () => {
  it("says nothing when a task joins a sprint from the backlog", () => {
    expect(
      fieldsClearedByMove({ fromSprintId: null, toSprintId: "s1" }, ALL_FILLED),
    ).toEqual([]);
  });

  it("says nothing when a task is reordered inside its own sprint", () => {
    expect(
      fieldsClearedByMove({ fromSprintId: "s1", toSprintId: "s1" }, ALL_FILLED),
    ).toEqual([]);
  });

  it("says nothing when the task has nothing worth losing", () => {
    expect(
      fieldsClearedByMove({ fromSprintId: "s1", toSprintId: null }, NONE_FILLED),
    ).toEqual([]);
  });

  it("warns as soon as a single field is filled", () => {
    expect(
      fieldsClearedByMove(
        { fromSprintId: "s1", toSprintId: null },
        { ...NONE_FILLED, hasRisk: true },
      ),
    ).toEqual(["Risk"]);
  });
});

describe("fieldsClearedByMove: what each destination clears", () => {
  it("clears all four on the way back to the backlog", () => {
    expect(
      fieldsClearedByMove({ fromSprintId: "s1", toSprintId: null }, ALL_FILLED),
    ).toEqual(["Decision", "Risk", "Estimate", "Assignee"]);
  });

  // setTaskSprint only nulls the estimate and assignee when the task leaves
  // sprints entirely. Claiming otherwise would make the dialog a liar.
  it("clears only Decision and Risk when handing over to another sprint", () => {
    expect(
      fieldsClearedByMove({ fromSprintId: "s1", toSprintId: "s2" }, ALL_FILLED),
    ).toEqual(["Decision", "Risk"]);
  });

  it("does not name the estimate when moving to another sprint even if set", () => {
    expect(
      fieldsClearedByMove(
        { fromSprintId: "s1", toSprintId: "s2" },
        { ...NONE_FILLED, hasEstimate: true, hasAssignee: true },
      ),
    ).toEqual([]);
  });

  it("names only the fields actually filled", () => {
    expect(
      fieldsClearedByMove(
        { fromSprintId: "s1", toSprintId: null },
        { hasDecision: true, hasRisk: false, hasEstimate: false, hasAssignee: true },
      ),
    ).toEqual(["Decision", "Assignee"]);
  });
});
