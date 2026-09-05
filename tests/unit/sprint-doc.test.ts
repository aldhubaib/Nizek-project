import { describe, expect, it } from "vitest";
import {
  SPRINT_OUTCOME_MARKER,
  committedSprintTasks,
  foldSprintItemList,
  scopeChangesFrom,
  sprintCardCarryFromHtml,
  sprintRemovedSectionHtml,
  splitSprintDoc,
  sprintDocHasOutcome,
  sprintDocHtml,
  sprintDocName,
  sprintScopeChanges,
  syncSprintDocOutcome,
  withSprintReviewDate,
} from "@/lib/sprint-doc";
import {
  planningInfoFromHtml,
  planningTaskIdsFromHtml,
  sprintTaskNodeHtml,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import { incompleteReasonsFromReviewHtml } from "@/lib/sprint-review-doc";

function task(
  id: string,
  title: string,
  stage = "BACKLOG",
  extra: Partial<SprintPlanningTask> = {},
): SprintPlanningTask {
  return {
    id,
    code: `F-${id}`,
    title,
    taskType: "FEATURE",
    stage,
    estimatedMinutes: null,
    sprintCount: 1,
    assignee: null,
    questions: [],
    ...extra,
  };
}

const info: SprintPlanningInfo = {
  sprintId: "sprint-1",
  sprintName: "Sprint 1",
  status: "PLANNED",
  documentDate: "1 Mar 2026",
  documentDateIso: "2026-03-01",
  startDate: "",
  endDate: "",
  startIso: "",
  endIso: "",
  workingDays: 10,
};

const planned = [task("a", "One"), task("b", "Two")];

describe("sprint document halves", () => {
  it("starts as a plan with no outcome", () => {
    const html = sprintDocHtml(planned, info);
    expect(sprintDocHasOutcome(html)).toBe(false);
    expect(splitSprintDoc(html).outcome).toBeNull();
    expect(planningTaskIdsFromHtml(html)).toEqual(["a", "b"]);
  });

  it("grows an outcome half the first time it is synced", () => {
    const html = syncSprintDocOutcome(
      sprintDocHtml(planned, info),
      [task("a", "One", "DONE")],
      [task("b", "Two")],
      { b: { incompleteReason: "Blocked on the vendor" } },
    );

    expect(sprintDocHasOutcome(html)).toBe(true);
    const { outcome } = splitSprintDoc(html);
    expect(outcome).toContain("Committed work");
    expect(outcome).toContain("Completed");
    expect(outcome).toContain("Not completed");
    expect(incompleteReasonsFromReviewHtml(html)).toEqual({
      b: "Blocked on the vendor",
    });
  });

  it("leaves the plan half byte-identical when the outcome is rebuilt", () => {
    const plan = sprintDocHtml(planned, info);
    const first = syncSprintDocOutcome(plan, [task("a", "One", "DONE")], [task("b", "Two")]);

    // The sprint moves on: the second task lands, the reason is no longer
    // needed, and none of that may touch what was committed to.
    const second = syncSprintDocOutcome(
      first,
      [task("a", "One", "DONE"), task("b", "Two", "DONE")],
      [],
    );

    expect(splitSprintDoc(second).plan).toBe(splitSprintDoc(first).plan);
    expect(splitSprintDoc(second).outcome).not.toBe(splitSprintDoc(first).outcome);
    // A sprint that finished everything says so by having nothing left to say.
    expect(splitSprintDoc(second).outcome).not.toContain("Not completed");
  });

  it("does not stack markers when synced repeatedly", () => {
    let html = sprintDocHtml(planned, info);
    for (let i = 0; i < 3; i++) {
      html = syncSprintDocOutcome(html, [], planned);
    }
    expect(html.match(/data-type="sprint-outcome"/g)).toHaveLength(1);
  });

  it("keeps an empty marker when the sprint started with nothing in it", () => {
    const html = syncSprintDocOutcome(sprintDocHtml([], info), [], []);
    expect(html).toContain(SPRINT_OUTCOME_MARKER);
  });

  it("edits below the marker survive nothing, edits above it survive everything", () => {
    const plan = `${sprintDocHtml(planned, info)}<p>A note the team typed into the plan.</p>`;
    const html = syncSprintDocOutcome(plan, [], planned);
    expect(html).toContain("A note the team typed into the plan.");
  });
});

// The outcome lists the same tasks the plan did, so the plan's list goes when
// the outcome arrives rather than the reader scrolling past two of them.
describe("folding the plan's item list into the outcome", () => {
  it("drops the item list once the sprint starts", () => {
    const started = syncSprintDocOutcome(
      sprintDocHtml(planned, info),
      [task("a", "One", "DONE")],
      [task("b", "Two")],
    );
    const { plan, outcome } = splitSprintDoc(started);

    expect(plan).not.toContain("List of Sprint Items");
    expect(planningTaskIdsFromHtml(plan)).toEqual([]);
    expect(plan).toContain("Introduction");
    expect(planningTaskIdsFromHtml(outcome ?? "")).toEqual(["a", "b"]);
  });

  it("carries Decision and Risk into the outcome rows", () => {
    const committed = task("a", "One", "BACKLOG", {
      decision: "Ship behind a flag",
      risk: "The vendor API is unproven",
    });
    const outcome = splitSprintDoc(
      syncSprintDocOutcome(sprintDocHtml([committed], info), [
        { ...committed, stage: "DONE" },
      ], []),
    ).outcome;

    expect(outcome).toContain("Ship behind a flag");
    expect(outcome).toContain("The vendor API is unproven");
  });

  it("folds a document written before the halves were merged", () => {
    // What the merge left behind: a plan list and an outcome listing the same
    // tasks. Closed sprints are never re-synced, so this happens on read.
    const legacy = `${sprintDocHtml(planned, info)}${SPRINT_OUTCOME_MARKER}<h2>Completed Sprint Items</h2>`;
    const folded = foldSprintItemList(legacy);

    expect(folded).not.toContain("List of Sprint Items");
    expect(folded).toContain("Completed Sprint Items");
    expect(committedSprintTasks(folded).map((t) => t.id)).toEqual(["a", "b"]);
    expect(foldSprintItemList(folded)).toBe(folded);
  });

  it("leaves a document alone until the sprint starts", () => {
    const html = sprintDocHtml(planned, info);
    expect(foldSprintItemList(html)).toBe(html);
  });
});

// A task pulled into a running sprint used to appear twice: once among the
// incomplete items and again in the list of additions. Grouping by where the
// work came from first gives every task exactly one home.
describe("the outcome grouped by what was promised", () => {
  const started = syncSprintDocOutcome(sprintDocHtml(planned, info), [], planned);
  const late = task("c", "Three", "BACKLOG", { unplanned: true });

  function outcomeOf(completed: SprintPlanningTask[], incomplete: SprintPlanningTask[]) {
    return splitSprintDoc(
      syncSprintDocOutcome(started, completed, incomplete, {}),
    ).outcome as string;
  }

  it("separates work added mid-sprint from work committed to", () => {
    const outcome = outcomeOf([task("a", "One", "DONE")], [task("b", "Two"), late]);
    const committedAt = outcome.indexOf("Committed work");
    const addedAt = outcome.indexOf("Added after the sprint started");

    expect(committedAt).toBeGreaterThanOrEqual(0);
    expect(addedAt).toBeGreaterThan(committedAt);
    // The late arrival sits under the second heading, not the first.
    expect(outcome.indexOf('data-id="c"')).toBeGreaterThan(addedAt);
    expect(outcome.indexOf('data-id="b"')).toBeLessThan(addedAt);
  });

  it("says nothing about additions when there were none", () => {
    expect(outcomeOf([], planned)).not.toContain("Added after the sprint started");
  });

  it("keeps a late arrival that landed apart from one that did not", () => {
    const outcome = outcomeOf([{ ...late, stage: "DONE" }], [task("b", "Two")]);
    const addedAt = outcome.indexOf("Added after the sprint started");
    expect(outcome.slice(addedAt)).toContain("Completed");
    expect(outcome.slice(addedAt)).not.toContain("Not completed");
  });

  it("carries what was typed into a card across a rebuild", () => {
    const carried = splitSprintDoc(
      syncSprintDocOutcome(started, [], planned, {
        b: { incompleteReason: "Blocked on the vendor" },
      }),
    ).outcome as string;

    expect(sprintCardCarryFromHtml(carried).b).toMatchObject({
      incompleteReason: "Blocked on the vendor",
    });
  });

  it("reads a delivered description and its photos back off the page", () => {
    const html = sprintTaskNodeHtml(task("a", "One", "DONE"), {
      variant: "completed",
      description: "Shipped behind a flag",
      descriptionImages: ["https://example.test/one.png"],
    });

    expect(sprintCardCarryFromHtml(html).a).toEqual({
      incompleteReason: undefined,
      description: "Shipped behind a flag",
      descriptionImages: ["https://example.test/one.png"],
    });
  });
});

describe("the record of what left the sprint", () => {
  it("prints nothing when the sprint kept everything it started with", () => {
    expect(sprintRemovedSectionHtml([])).toBe("");
  });

  it("names the reason it was taken out and where it went", () => {
    const html = sprintRemovedSectionHtml([
      { task: task("b", "Two"), reason: "Descoped by the client", movedTo: "Sprint 2" },
    ]);

    expect(html).toContain("Removed after the sprint started");
    expect(html).toContain("Descoped by the client");
    expect(html).toContain('data-moved-to="Sprint 2"');
  });
});

// Once a sprint starts its document stops following the sprint, so the two can
// disagree. These are the two ways they can, reported under the outcome.
describe("sprint scope changes after the sprint started", () => {
  const committed = sprintDocHtml(planned, info);
  const started = syncSprintDocOutcome(committed, [], planned);

  it("reports nothing while the sprint still matches its plan", () => {
    const changes = sprintScopeChanges(started, planned);
    expect(changes.added).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("reports a task the sprint gained after the plan was frozen", () => {
    const changes = sprintScopeChanges(started, [...planned, task("c", "Three")]);
    expect(changes.added.map((t) => t.id)).toEqual(["c"]);
    expect(changes.removed).toEqual([]);
  });

  it("reports a task dropped from the sprint, with what was promised for it", () => {
    const html = syncSprintDocOutcome(
      sprintDocHtml(
        [task("a", "One"), task("b", "Two", "BACKLOG", { estimatedMinutes: 120 })],
        info,
      ),
      [],
      planned,
    );
    const changes = sprintScopeChanges(html, [task("a", "One")]);

    expect(changes.added).toEqual([]);
    expect(changes.removed).toHaveLength(1);
    expect(changes.removed[0]).toMatchObject({
      id: "b",
      title: "Two",
      estimatedMinutes: 120,
    });
  });

  it("still remembers a dropped task after the outcome is rebuilt without it", () => {
    // The task leaves the sprint, so the next sync's outcome no longer lists
    // it. The promise has to outlive the row that used to carry it.
    const later = syncSprintDocOutcome(started, [], [task("a", "One")]);
    expect(sprintScopeChanges(later, [task("a", "One")]).removed.map((t) => t.id)).toEqual([
      "b",
    ]);
  });

  it("reports both directions at once", () => {
    const changes = sprintScopeChanges(started, [task("a", "One"), task("c", "Three")]);
    expect(changes.added.map((t) => t.id)).toEqual(["c"]);
    expect(changes.removed.map((t) => t.id)).toEqual(["b"]);
  });

  it("treats a task put back into the sprint as no longer removed", () => {
    const changes = sprintScopeChanges(started, [task("b", "Two"), task("a", "One")]);
    expect(changes.added).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("falls back to each task's own flag when the document remembers nothing", () => {
    const changes = scopeChangesFrom(null, [
      task("a", "One"),
      task("c", "Three", "BACKLOG", { unplanned: true }),
    ]);
    expect(changes.added.map((t) => t.id)).toEqual(["c"]);
    expect(changes.removed).toEqual([]);
  });

  it("counts a duplicated block in an unstarted document once", () => {
    const doubled = committed + sprintTaskNodeHtml(task("b", "Two"));
    expect(sprintScopeChanges(doubled, [task("a", "One")]).removed.map((t) => t.id)).toEqual([
      "b",
    ]);
  });
});

describe("sprint document dates", () => {
  it("fills in a missing review date without disturbing the plan date", () => {
    const html = withSprintReviewDate(sprintDocHtml(planned, info), "2026-03-20");
    const parsed = planningInfoFromHtml(html);
    expect(parsed?.documentDateIso).toBe("2026-03-01");
    expect(parsed?.reviewDateIso).toBe("2026-03-20");
    expect(parsed?.reviewDate).toBe("20 Mar 2026");
  });

  it("keeps a review date somebody already chose", () => {
    const once = withSprintReviewDate(sprintDocHtml(planned, info), "2026-03-20");
    const twice = withSprintReviewDate(once, "2026-04-01");
    expect(planningInfoFromHtml(twice)?.reviewDateIso).toBe("2026-03-20");
  });
});

describe("sprint document naming", () => {
  it("drops the suffix the two old documents needed to tell each other apart", () => {
    expect(sprintDocName("Sprint 16 planning")).toBe("Sprint 16");
    expect(sprintDocName("Sprint 16 Review")).toBe("Sprint 16");
    expect(sprintDocName("Sprint 16")).toBe("Sprint 16");
  });
});
