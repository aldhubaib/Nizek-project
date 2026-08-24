import { describe, expect, it } from "vitest";
import { sprintStartBlockedReason } from "@/lib/sprint-planning-doc";

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
});
