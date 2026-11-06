import { describe, expect, it } from "vitest";

import type { SprintPlanningInfo, SprintPlanningTask } from "@/lib/sprint-planning-doc";
import { endGaps, groupOutcome, infoToShow, reasonsToSend, requiredFieldCount, shortTitle, sprintSpanText, startGaps } from "@/next-ui/screens/projects/sprint-doc-state";

const task = (over: Partial<SprintPlanningTask>): SprintPlanningTask => ({
  id: "t",
  code: "F-1",
  title: "Task",
  taskType: "FEATURE",
  stage: "PLANNED",
  estimatedMinutes: 60,
  sprintCount: 1,
  assignee: { id: "u1", name: "Sara", imageUrl: null },
  questions: [],
  decision: "Build it.",
  risk: "None.",
  ...over,
});

const info = (over: Partial<SprintPlanningInfo>): SprintPlanningInfo => ({
  sprintId: "s1",
  sprintName: "Sprint 2",
  documentDate: "1 Nov 2026",
  documentDateIso: "2026-11-01",
  startDate: "2 Nov 2026",
  endDate: "12 Nov 2026",
  startIso: "2026-11-02",
  endIso: "2026-11-12",
  workingDays: 9,
  ...over,
});

describe("groupOutcome", () => {
  it("splits the outcome into committed and added work, each finished or not, by the document's committed list", () => {
    const done = [task({ id: "a" }), task({ id: "b", unplanned: true })];
    const open = [task({ id: "c" }), task({ id: "d" })];
    const groups = groupOutcome(done, open, ["a", "c", "b"]);
    expect(groups.committed.completed.map((t) => t.id)).toEqual(["a", "b"]);
    expect(groups.committed.incomplete.map((t) => t.id)).toEqual(["c"]);
    expect(groups.added.completed).toEqual([]);
    expect(groups.added.incomplete.map((t) => t.id)).toEqual(["d"]);
  });

  it("falls back to each task's own flag when the document recorded no committed list", () => {
    const groups = groupOutcome([task({ id: "a" }), task({ id: "b", unplanned: true })], [], []);
    expect(groups.committed.completed.map((t) => t.id)).toEqual(["a"]);
    expect(groups.added.completed.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("infoToShow", () => {
  it("shows the document's own rows when there is a document", () => {
    const shown = infoToShow(info({ workingDays: 9 }), info({ workingDays: 3 }), "NEXT");
    expect(shown?.workingDays).toBe(9);
  });

  it("starts a new plan with an empty table, as the live editor does", () => {
    const shown = infoToShow(null, info({}), "NEXT");
    expect(shown).toMatchObject({ documentDateIso: "", startIso: "", endIso: "", workingDays: "" });
    expect(shown?.sprintName).toBe("Sprint 2");
  });

  it("locks a started sprint's schedule and dates the review today when the document is not there yet", () => {
    const shown = infoToShow(null, info({}), "ACTIVE");
    expect(shown?.locked).toBe(true);
    expect(shown?.startIso).toBe("2026-11-02");
    expect(shown?.reviewDateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shown?.reviewDate).not.toBe("");
  });

  it("has nothing to show without a plan", () => {
    expect(infoToShow(null, undefined, "NEXT")).toBeNull();
  });
});

describe("startGaps", () => {
  it("counts the empty schedule cells and every task's missing estimate, person, Decision and Risk", () => {
    const gaps = startGaps({
      info: info({ documentDateIso: "", startIso: "", endIso: "", workingDays: "" }),
      tasks: [task({}), task({ estimatedMinutes: null, assignee: null, decision: "", risk: "" })],
      activeSprintName: null,
      hideAssignees: false,
    });
    expect(gaps.total).toBe(8);
    expect(gaps.items.map((i) => i.key)).toEqual(["info", "estimate", "assignee", "decision", "risk"]);
    expect(gaps.reason).toBeTruthy();
  });

  it("does not count the people a client cannot see", () => {
    const gaps = startGaps({ info: info({}), tasks: [task({ assignee: null })], activeSprintName: null, hideAssignees: true });
    expect(gaps.total).toBe(0);
    expect(gaps.reason).toBeNull();
  });

  it("says to finish the running sprint first, and refuses an end before the start", () => {
    expect(startGaps({ info: info({}), tasks: [task({})], activeSprintName: "Sprint 1", hideAssignees: false }).reason).toBe('Finish "Sprint 1" before starting this sprint.');
    expect(startGaps({ info: info({ startIso: "2026-11-12", endIso: "2026-11-02" }), tasks: [task({})], activeSprintName: null, hideAssignees: false }).reason).toMatch(/end/i);
  });
});

describe("endGaps and reasonsToSend", () => {
  const open = [task({ id: "a" }), task({ id: "b" })];

  it("asks for the review date, a reason per unfinished task (typed or already in the document) and the review video where one is required", () => {
    const none = endGaps({ info: info({}), incomplete: open, drafts: {}, carry: {}, needsReviewVideo: true, reviewVideos: 0 });
    expect(none.items.map((i) => i.key)).toEqual(["info", "reason", "video"]);
    expect(none.total).toBe(4);

    const some = endGaps({ info: info({ reviewDateIso: "2026-11-13", reviewDate: "13 Nov 2026" }), incomplete: open, drafts: { a: "Ran out of time." }, carry: { b: { incompleteReason: "Blocked." } }, needsReviewVideo: true, reviewVideos: 1 });
    expect(some.total).toBe(0);
    expect(some.reason).toBeNull();
  });

  it("sends what was typed over what the document holds, and nothing for a task without a reason", () => {
    expect(reasonsToSend(open, { a: " Ran out of time. " }, { a: { incompleteReason: "Old." }, b: { incompleteReason: "" } })).toEqual({ a: "Ran out of time." });
  });
});

describe("requiredFieldCount", () => {
  it("counts what the ring fills with: the schedule cells plus four per task before the start, three for a client", () => {
    expect(requiredFieldCount({ started: false, tasks: 2, hideAssignees: false, incomplete: 0, needsReviewVideo: false })).toBe(12);
    expect(requiredFieldCount({ started: false, tasks: 2, hideAssignees: true, incomplete: 0, needsReviewVideo: false })).toBe(10);
    expect(requiredFieldCount({ started: false, tasks: 0, hideAssignees: false, incomplete: 0, needsReviewVideo: false })).toBe(4);
  });

  it("in the review: the five cells with the review date, a reason per unfinished task, the video where it is required", () => {
    expect(requiredFieldCount({ started: true, tasks: 5, hideAssignees: false, incomplete: 2, needsReviewVideo: false })).toBe(7);
    expect(requiredFieldCount({ started: true, tasks: 5, hideAssignees: false, incomplete: 2, needsReviewVideo: true })).toBe(8);
  });

  it("agrees with the gap counters, so an empty document is all missing and a full one is none", () => {
    const empty = info({ documentDateIso: "", startIso: "", endIso: "", workingDays: "" });
    const bare = [task({ estimatedMinutes: null, assignee: null, decision: "", risk: "" })];
    expect(startGaps({ info: empty, tasks: bare, activeSprintName: null, hideAssignees: false }).total).toBe(requiredFieldCount({ started: false, tasks: 1, hideAssignees: false, incomplete: 0, needsReviewVideo: false }));
    expect(endGaps({ info: empty, incomplete: bare, drafts: {}, carry: {}, needsReviewVideo: true, reviewVideos: 0 }).total).toBe(requiredFieldCount({ started: true, tasks: 1, hideAssignees: false, incomplete: 1, needsReviewVideo: true }));
  });
});

describe("shortTitle and sprintSpanText", () => {
  it("cuts a title to fifteen words", () => {
    const long = Array.from({ length: 20 }, (_, i) => `w${i + 1}`).join(" ");
    expect(shortTitle(long)).toBe(`${Array.from({ length: 15 }, (_, i) => `w${i + 1}`).join(" ")}…`);
    expect(shortTitle("Short one")).toBe("Short one");
  });

  it("counts the sprint's days inclusively, as the live Start confirmation does", () => {
    expect(sprintSpanText("2026-11-02", "2026-11-12")).toEqual({ start: "2 Nov 2026", end: "12 Nov 2026", days: 11 });
    expect(sprintSpanText("", "")).toEqual({ start: "—", end: "—", days: 0 });
  });
});
