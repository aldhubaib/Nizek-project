import { describe, expect, it } from "vitest";

import { isValidSprintMove, MISSING_DATA_NOTICE, reorderedTasks, roadmapDrop, sprintStageMoves } from "@/next-ui/screens/projects/board-state";
import { parseEstimate } from "@/next-ui/patterns/form-bits";

/**
 * The drop rules of the two boards, worked out before anything is sent: what a card landing
 * on a lane, a task or a sprint card means on the road map, which stage moves the sprint
 * board allows, and how an estimate typed by hand is read.
 */

const t = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  taskNumber: 1,
  taskType: "FEATURE",
  stage: "BACKLOG",
  order: 0,
  priority: "NORMAL",
  sprintId: null,
  isReadyForTransition: true,
  ...over,
});

const lanes = { planned: new Set(["sp1", "sp2"]), next: "sn", firstPlanned: "sp1" };
const empty = { planned: new Set<string>(), next: null, firstPlanned: null };

describe("a drop on the road map", () => {
  it("takes nothing into Missing data, and refuses a task that still has missing data anywhere", () => {
    expect(roadmapDrop(t("a"), { kind: "lane", lane: "missing" }, lanes)).toEqual({ kind: "none" });
    const missing = t("m", { isReadyForTransition: false });
    expect(roadmapDrop(missing, { kind: "lane", lane: "planned" }, lanes)).toEqual({ kind: "refuse", reason: MISSING_DATA_NOTICE });
    expect(roadmapDrop(missing, { kind: "lane", lane: "next" }, lanes)).toEqual({ kind: "refuse", reason: MISSING_DATA_NOTICE });
    expect(roadmapDrop(missing, { kind: "lane", lane: "backlog" }, lanes)).toEqual({ kind: "refuse", reason: MISSING_DATA_NOTICE });
    expect(roadmapDrop(missing, { kind: "sprint", sprintId: "sp1", status: "PLANNED" }, lanes)).toEqual({ kind: "refuse", reason: MISSING_DATA_NOTICE });
  });

  it("schedules a backlog task into the lane's sprint, or asks for one when the lane is empty", () => {
    expect(roadmapDrop(t("a"), { kind: "lane", lane: "planned" }, lanes)).toEqual({ kind: "schedule", column: "PLANNED", sprintId: "sp1" });
    expect(roadmapDrop(t("a"), { kind: "lane", lane: "next" }, lanes)).toEqual({ kind: "schedule", column: "NEXT", sprintId: "sn" });
    expect(roadmapDrop(t("a"), { kind: "lane", lane: "next" }, empty)).toEqual({ kind: "schedule", column: "NEXT", sprintId: null });
  });

  it("takes a scheduled task back to the backlog, and reorders within a lane the task is already in", () => {
    const planned = t("p", { stage: "PLANNED", sprintId: "sp2" });
    expect(roadmapDrop(planned, { kind: "lane", lane: "backlog" }, lanes)).toEqual({ kind: "unschedule" });
    expect(roadmapDrop(planned, { kind: "lane", lane: "planned" }, lanes)).toEqual({ kind: "none" });
    expect(roadmapDrop(planned, { kind: "task", lane: "planned", taskId: "q" }, lanes)).toEqual({ kind: "reorder", lane: "planned", overTaskId: "q" });
    // dropped on itself: nothing
    expect(roadmapDrop(planned, { kind: "task", lane: "planned", taskId: "p" }, lanes)).toEqual({ kind: "none" });
    // from Planned to Next is a schedule into the other sprint
    expect(roadmapDrop(planned, { kind: "lane", lane: "next" }, lanes)).toEqual({ kind: "schedule", column: "NEXT", sprintId: "sn" });
    const loose = t("a");
    expect(roadmapDrop(loose, { kind: "task", lane: "backlog", taskId: "b" }, lanes)).toEqual({ kind: "reorder", lane: "backlog", overTaskId: "b" });
    expect(roadmapDrop(loose, { kind: "lane", lane: "backlog" }, lanes)).toEqual({ kind: "none" });
  });

  it("moves a task into a sprint card, flags a running one, and ignores closed or same sprints", () => {
    expect(roadmapDrop(t("a"), { kind: "sprint", sprintId: "sp1", status: "PLANNED" }, lanes)).toEqual({ kind: "into-sprint", sprintId: "sp1", running: false });
    expect(roadmapDrop(t("a"), { kind: "sprint", sprintId: "sa", status: "ACTIVE" }, lanes)).toEqual({ kind: "into-sprint", sprintId: "sa", running: true });
    expect(roadmapDrop(t("a"), { kind: "sprint", sprintId: "sd", status: "COMPLETED" }, lanes)).toEqual({ kind: "none" });
    expect(roadmapDrop(t("a"), { kind: "sprint", sprintId: "ss", status: "SHIPPED" }, lanes)).toEqual({ kind: "none" });
    expect(roadmapDrop(t("a", { sprintId: "sp1" }), { kind: "sprint", sprintId: "sp1", status: "PLANNED" }, lanes)).toEqual({ kind: "none" });
  });
});

describe("reordering within a lane", () => {
  const list = [
    { id: "a", order: 0 },
    { id: "b", order: 1 },
    { id: "c", order: 2 },
    { id: "d", order: 3 },
  ];

  it("sends only the tasks whose order changes", () => {
    expect(reorderedTasks(list, "a", "c")).toEqual([
      { taskId: "b", order: 0 },
      { taskId: "c", order: 1 },
      { taskId: "a", order: 2 },
    ]);
    expect(reorderedTasks(list, "d", "a")).toEqual([
      { taskId: "d", order: 0 },
      { taskId: "a", order: 1 },
      { taskId: "b", order: 2 },
      { taskId: "c", order: 3 },
    ]);
  });

  it("does nothing for an unknown task or a drop on itself", () => {
    expect(reorderedTasks(list, "a", "a")).toEqual([]);
    expect(reorderedTasks(list, "x", "a")).toEqual([]);
    expect(reorderedTasks(list, "a", "x")).toEqual([]);
  });
});

describe("the sprint board's moves", () => {
  it("offers one step forward, and the decline back from review", () => {
    expect(sprintStageMoves("TODO")).toEqual([{ to: "IN_DEVELOPMENT" }]);
    expect(sprintStageMoves("IN_DEVELOPMENT")).toEqual([{ to: "INTERNAL_REVIEW" }]);
    expect(sprintStageMoves("INTERNAL_REVIEW")).toEqual([{ to: "DONE" }, { to: "IN_DEVELOPMENT", decline: true }]);
    expect(sprintStageMoves("DONE")).toEqual([]);
    expect(sprintStageMoves("BACKLOG")).toEqual([]);
  });

  it("allows a drag one stage on, review to Done, the decline, and nothing else", () => {
    expect(isValidSprintMove("TODO", "IN_DEVELOPMENT")).toBe(true);
    expect(isValidSprintMove("IN_DEVELOPMENT", "INTERNAL_REVIEW")).toBe(true);
    expect(isValidSprintMove("INTERNAL_REVIEW", "DONE")).toBe(true);
    expect(isValidSprintMove("INTERNAL_REVIEW", "IN_DEVELOPMENT")).toBe(true);
    expect(isValidSprintMove("TODO", "INTERNAL_REVIEW")).toBe(false);
    expect(isValidSprintMove("TODO", "DONE")).toBe(false);
    expect(isValidSprintMove("DONE", "INTERNAL_REVIEW")).toBe(false);
    expect(isValidSprintMove("IN_DEVELOPMENT", "TODO")).toBe(false);
    expect(isValidSprintMove("TODO", "TODO")).toBe(false);
    expect(isValidSprintMove("BACKLOG", "TODO")).toBe(false);
  });
});

describe("an estimate typed by hand", () => {
  it("reads hours and minutes in the usual ways, a bare number as hours", () => {
    expect(parseEstimate("2")).toBe(120);
    expect(parseEstimate("1.5")).toBe(90);
    expect(parseEstimate("45m")).toBe(45);
    expect(parseEstimate("1h 30m")).toBe(90);
    expect(parseEstimate("2 hours 15 minutes")).toBe(135);
    expect(parseEstimate("3hrs")).toBe(180);
  });

  it("gives nothing for an empty or unreadable field", () => {
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("   ")).toBeNull();
    expect(parseEstimate("soon")).toBeNull();
    expect(parseEstimate("0m")).toBeNull();
  });
});
