import { describe, it, expect, vi } from "vitest";
import { applyStageChange, applyBulkStageChange } from "@/lib/stage-transition";
import type { StageWriteClient } from "@/lib/stage-transition";

/** A transaction client that records what was asked of it, in order. */
function fakeTx() {
  const calls: { op: string; args: any }[] = [];
  const record = (op: string) => vi.fn(async (args: any) => {
    calls.push({ op, args });
    return {};
  });
  const tx = {
    stageLog: {
      updateMany: record("stageLog.updateMany"),
      create: record("stageLog.create"),
      createMany: record("stageLog.createMany"),
    },
    taskActivity: {
      create: record("taskActivity.create"),
      createMany: record("taskActivity.createMany"),
    },
  };
  return { tx: tx as unknown as StageWriteClient, calls };
}

const AT = new Date("2026-07-01T10:00:00Z");

describe("applyStageChange", () => {
  it("closes the open visit before opening the next one", async () => {
    // A partial unique index allows one open row per task, so inserting first
    // would be rejected by Postgres.
    const { tx, calls } = fakeTx();
    await applyStageChange(tx, {
      taskId: "t1",
      fromStage: "TODO",
      toStage: "IN_DEVELOPMENT",
      actorId: "u1",
      source: "USER_MOVE",
      at: AT,
    });

    expect(calls.map((c) => c.op)).toEqual([
      "stageLog.updateMany",
      "stageLog.create",
      "taskActivity.create",
    ]);
    expect(calls[0].args).toEqual({
      where: { taskId: "t1", exitedAt: null },
      data: { exitedAt: AT },
    });
  });

  it("stamps the new visit with everything needed to answer 'who and why'", async () => {
    const { tx, calls } = fakeTx();
    await applyStageChange(tx, {
      taskId: "t1",
      fromStage: "IN_DEVELOPMENT",
      toStage: "BACKLOG",
      actorId: "u2",
      source: "SPRINT_COMPLETE",
      reason: "Sprint 21 completed without it",
      sprintId: "s1",
      sprintName: "Sprint 21",
      assigneeId: "u9",
      at: AT,
    });

    expect(calls[1].args.data).toEqual({
      taskId: "t1",
      stage: "BACKLOG",
      fromStage: "IN_DEVELOPMENT",
      enteredAt: AT,
      actorId: "u2",
      source: "SPRINT_COMPLETE",
      reason: "Sprint 21 completed without it",
      sprintId: "s1",
      sprintName: "Sprint 21",
      assigneeId: "u9",
    });
  });

  it("records a transition even when nobody triggered it, naming the source", async () => {
    const { tx, calls } = fakeTx();
    await applyStageChange(tx, {
      taskId: "t1",
      fromStage: "PLANNED",
      toStage: "TODO",
      actorId: null,
      source: "SPRINT_START",
      at: AT,
    });

    const created = calls.find((c) => c.op === "stageLog.create")!;
    expect(created.args.data.actorId).toBeNull();
    expect(created.args.data.source).toBe("SPRINT_START");
    // No actor means no activity row: TaskActivity requires a user, and
    // inventing one would misattribute the move.
    expect(calls.some((c) => c.op === "taskActivity.create")).toBe(false);
  });

  it("ignores a move that does not change the stage", async () => {
    // Recording one would split a single stretch of time into two shorter ones
    // and understate how long the task actually sat there.
    const { tx, calls } = fakeTx();
    await applyStageChange(tx, {
      taskId: "t1",
      fromStage: "DONE",
      toStage: "DONE",
      actorId: "u1",
      source: "USER_MOVE",
    });
    expect(calls).toHaveLength(0);
  });

  it("still opens a visit on creation, where there is no previous stage", async () => {
    const { tx, calls } = fakeTx();
    await applyStageChange(tx, {
      taskId: "t1",
      fromStage: null,
      toStage: "BACKLOG",
      actorId: "u1",
      source: "TASK_CREATED",
      at: AT,
    });

    const created = calls.find((c) => c.op === "stageLog.create")!;
    expect(created.args.data.fromStage).toBeNull();
    expect(created.args.data.stage).toBe("BACKLOG");
    // createTask writes its own "created" activity; a duplicate "moved" would
    // read as if someone had moved a task that had only just appeared.
    expect(calls.some((c) => c.op === "taskActivity.create")).toBe(false);
  });
});

describe("applyBulkStageChange", () => {
  const tasks = [
    { id: "t1", stage: "DONE" as const, assigneeId: "u9" },
    { id: "t2", stage: "IN_DEVELOPMENT" as const, assigneeId: null },
    { id: "t3", stage: "BACKLOG" as const },
  ];

  it("logs one visit per task, carrying each task's own from-stage", async () => {
    const { tx, calls } = fakeTx();
    await applyBulkStageChange(tx, {
      tasks,
      toStage: "BACKLOG",
      actorId: "u1",
      source: "SPRINT_COMPLETE",
      sprintId: "s1",
      sprintName: "Sprint 21",
      at: AT,
    });

    const created = calls.find((c) => c.op === "stageLog.createMany")!;
    // t3 is already in Backlog, so it is not a visit.
    expect(created.args.data.map((r: any) => [r.taskId, r.fromStage, r.stage])).toEqual([
      ["t1", "DONE", "BACKLOG"],
      ["t2", "IN_DEVELOPMENT", "BACKLOG"],
    ]);
    expect(created.args.data.every((r: any) => r.sprintName === "Sprint 21")).toBe(true);
  });

  it("lets a per-task reason override the shared one", async () => {
    // Sprint completion records a different explanation for each unfinished task.
    const { tx, calls } = fakeTx();
    await applyBulkStageChange(tx, {
      tasks: [
        { id: "t1", stage: "TODO", reason: "Never started" },
        { id: "t2", stage: "IN_DEVELOPMENT" },
      ],
      toStage: "BACKLOG",
      actorId: "u1",
      source: "SPRINT_COMPLETE",
      reason: "Sprint 21 completed",
      at: AT,
    });

    const created = calls.find((c) => c.op === "stageLog.createMany")!;
    expect(created.args.data.map((r: any) => r.reason)).toEqual([
      "Never started",
      "Sprint 21 completed",
    ]);
  });

  it("does nothing at all when every task is already in the target stage", async () => {
    const { tx, calls } = fakeTx();
    await applyBulkStageChange(tx, {
      tasks: [{ id: "t1", stage: "COMPLETED" }],
      toStage: "COMPLETED",
      actorId: "u1",
      source: "SPRINT_STATUS",
    });
    expect(calls).toHaveLength(0);
  });

  it("closes only the moving tasks' open visits", async () => {
    const { tx, calls } = fakeTx();
    await applyBulkStageChange(tx, {
      tasks,
      toStage: "BACKLOG",
      actorId: "u1",
      source: "SPRINT_UNSCHEDULE",
      at: AT,
    });

    expect(calls[0]).toEqual({
      op: "stageLog.updateMany",
      args: { where: { taskId: { in: ["t1", "t2"] }, exitedAt: null }, data: { exitedAt: AT } },
    });
  });
});
