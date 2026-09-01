import { describe, expect, it } from "vitest";
import { planTaskSync } from "@/components/kanban/use-project-task-sync";

const idle = { currentUserId: "me", dragging: false, busy: false };

describe("planTaskSync — sprint payloads", () => {
  it("re-reads every task when a sprint changes status", () => {
    // Starting a sprint moves the whole backlog into Todo without emitting a
    // single task-* event, so nothing else would refresh those cards.
    const plan = planTaskSync(
      { type: "sprint.status-changed", sprintId: "s1", status: "ACTIVE" },
      idle,
    );
    expect(plan.resync).toBe(true);
    expect(plan.notifySprint).toBe(true);
  });

  it("patches just the task that moved in or out of a sprint", () => {
    const plan = planTaskSync(
      { type: "sprint.task-assigned", sprintId: "s1", taskId: "t1" },
      idle,
    );
    expect(plan.patchTaskId).toBe("t1");
    expect(plan.resync).toBe(false);
    expect(plan.notifySprint).toBe(true);
  });

  it("falls back to a full re-read while a drag is in flight", () => {
    const plan = planTaskSync(
      { type: "sprint.task-removed", taskId: "t1" },
      { ...idle, dragging: true },
    );
    expect(plan.patchTaskId).toBeUndefined();
    expect(plan.resync).toBe(true);
  });

  it("still tells the sprint list about its own events", () => {
    expect(planTaskSync({ type: "sprint.updated", sprintId: "s1" }, idle).notifySprint).toBe(true);
  });
});

describe("planTaskSync — task payloads", () => {
  it("patches another user's move", () => {
    const plan = planTaskSync({ type: "task-moved", taskId: "t1", userId: "them" }, idle);
    expect(plan.patchTaskId).toBe("t1");
    expect(plan.notifySprint).toBe(false);
  });

  it("removes a deleted task", () => {
    const plan = planTaskSync({ type: "task-deleted", taskId: "t1", userId: "them" }, idle);
    expect(plan.removeTaskId).toBe("t1");
    expect(plan.patchTaskId).toBeUndefined();
  });

  it("ignores our own edits, which already patched the store", () => {
    const plan = planTaskSync({ type: "task-updated", taskId: "t1", userId: "me" }, idle);
    expect(plan).toEqual({ notifySprint: false, resync: false });
  });

  it("takes our own move when we are not the one dragging", () => {
    // A bypass we just approved lands as our own task-moved.
    const plan = planTaskSync({ type: "task-moved", taskId: "t1", userId: "me" }, idle);
    expect(plan.patchTaskId).toBe("t1");
  });

  it("drops our own move while we drag, so it cannot fight the drag", () => {
    const plan = planTaskSync(
      { type: "task-moved", taskId: "t1", userId: "me" },
      { ...idle, dragging: true },
    );
    expect(plan).toEqual({ notifySprint: false, resync: false });
  });

  it("holds remote task edits while dragging or busy", () => {
    const remote = { type: "task-updated", taskId: "t1", userId: "them" };
    expect(planTaskSync(remote, { ...idle, dragging: true }).patchTaskId).toBeUndefined();
    expect(planTaskSync(remote, { ...idle, busy: true }).patchTaskId).toBeUndefined();
  });
});

describe("planTaskSync — everything else", () => {
  it("ignores chat and other traffic on the project channel", () => {
    expect(planTaskSync({ type: "message.new", id: "m1" }, idle)).toEqual({
      notifySprint: false,
      resync: false,
    });
  });

  it("ignores malformed payloads", () => {
    for (const bad of [null, undefined, {}, "nope", 7]) {
      expect(planTaskSync(bad, idle)).toEqual({ notifySprint: false, resync: false });
    }
  });
});
