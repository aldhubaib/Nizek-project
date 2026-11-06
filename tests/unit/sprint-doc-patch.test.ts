import { describe, expect, it } from "vitest";

import { hasSprintOutcomeCard, sprintTaskTagId, withSprintCardCarry } from "@/lib/sprint-doc-patch";
import { sprintCardCarryFromHtml, syncSprintDocOutcome } from "@/lib/sprint-doc";
import { sprintPlanningDocHtml, sprintTaskNodeHtml, type SprintPlanningInfo, type SprintPlanningTask } from "@/lib/sprint-planning-doc";
import { incompleteReasonsFromReviewHtml } from "@/lib/sprint-review-doc";

const info: SprintPlanningInfo = {
  sprintId: "s1",
  sprintName: "Sprint 2",
  status: "ACTIVE",
  documentDate: "1 Nov 2026",
  documentDateIso: "2026-11-01",
  startDate: "2 Nov 2026",
  endDate: "12 Nov 2026",
  startIso: "2026-11-02",
  endIso: "2026-11-12",
  workingDays: 9,
};

const task = (id: string, stage: string, over: Partial<SprintPlanningTask> = {}): SprintPlanningTask => ({
  id,
  code: `F-${id}`,
  title: `Task ${id}`,
  taskType: "FEATURE",
  stage,
  estimatedMinutes: 60,
  sprintCount: 1,
  assignee: { id: "u1", name: "Sara", imageUrl: null },
  questions: [],
  decision: "Ship it",
  risk: "None",
  ...over,
});

const done = task("a", "DONE");
const open = task("b", "IN_DEVELOPMENT");
const plan = sprintPlanningDocHtml([done, open], info);
const doc = syncSprintDocOutcome(plan, [done], [open]);

describe("withSprintCardCarry", () => {
  it("writes the reason into the incomplete card and nothing else changes", () => {
    const next = withSprintCardCarry(doc, "b", { incompleteReason: 'Blocked by the "API" <team> & co' });
    expect(incompleteReasonsFromReviewHtml(next)).toEqual({ b: 'Blocked by the "API" <team> & co' });
    // the completed card and the prose are untouched
    expect(next.replace(/<div\b[^>]*data-id="b"[^>]*>/i, "")).toBe(doc.replace(/<div\b[^>]*data-id="b"[^>]*>/i, ""));
  });

  it("writes what was delivered and the photos into the completed card, and reads them back", () => {
    const next = withSprintCardCarry(doc, "a", { description: "Two screens & a fix", descriptionImages: ["https://r2.example/1.png"] });
    expect(sprintCardCarryFromHtml(next).a).toEqual({ incompleteReason: undefined, description: "Two screens & a fix", descriptionImages: ["https://r2.example/1.png"] });
    // a later write of one key keeps the other
    const later = withSprintCardCarry(next, "a", { descriptionImages: [] });
    expect(sprintCardCarryFromHtml(later).a?.description).toBe("Two screens & a fix");
    expect(sprintCardCarryFromHtml(later).a?.descriptionImages).toBeUndefined();
  });

  it("leaves the plan's rows and the removed section alone", () => {
    const planOnly = withSprintCardCarry(plan, "b", { incompleteReason: "late" });
    expect(planOnly).toBe(plan);
    const removed = sprintTaskNodeHtml(open, { variant: "removed", incompleteReason: "moved" });
    expect(withSprintCardCarry(removed, "b", { incompleteReason: "changed" })).toBe(removed);
  });

  it("knows which cards are there to write to", () => {
    expect(hasSprintOutcomeCard(doc, "a")).toBe(true);
    expect(hasSprintOutcomeCard(doc, "b")).toBe(true);
    expect(hasSprintOutcomeCard(doc, "zzz")).toBe(false);
    expect(hasSprintOutcomeCard(plan, "a")).toBe(false);
  });

  it("finds the task behind a card from data-id or the embedded task", () => {
    expect(sprintTaskTagId('<div data-type="sprint-task" data-id="t1">')).toBe("t1");
    expect(sprintTaskTagId('<div data-type="sprint-task" data-task="{&quot;id&quot;:&quot;t2&quot;}">')).toBe("t2");
    expect(sprintTaskTagId('<div data-type="sprint-task">')).toBeNull();
  });
});
