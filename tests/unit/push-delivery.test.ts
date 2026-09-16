// Server delivery (src/lib/push/delivery.ts), job shapes and the outbox
// dispatcher (src/lib/push/outbox-core.ts). The database and the push service
// are fakes; what we assert is the EFFECT each outcome must have.

import { describe, expect, it, vi } from "vitest";
import {
  PUSH_JOB_CHUNK_SIZE,
  PUSH_MAX_FAIL_COUNT,
  buildPushJobs,
  chunkRecipients,
  classifyOutcome,
  mapWithConcurrency,
  parsePushJob,
  pushJobId,
} from "@/lib/push-core";
import {
  applyDeliveryEffects,
  deliverToSubscriptions,
  p95,
  retiredIds,
  type DeliverableSubscription,
  type DeliveryDb,
} from "@/lib/push/delivery";
import {
  dispatchOutboxRows,
  enqueueOutboxRow,
  sweepOutbox,
  type OutboxDb,
  type OutboxRow,
  type QueueLike,
} from "@/lib/push/outbox-core";

const PAYLOAD = { title: "Hello", body: "World", url: "/dashboard", tag: "t1", type: "message" };

function sub(id: string, failCount = 0, memberId = "u1"): DeliverableSubscription {
  return {
    id,
    memberId,
    endpoint: `https://web.push.apple.com/${id}`,
    p256dh: "p",
    auth: "a",
    failCount,
  };
}

function httpError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

function fakeDb() {
  const calls = {
    createMany: [] as unknown[],
    updateMany: [] as unknown[],
    deleteMany: [] as unknown[],
  };
  const db: DeliveryDb = {
    pushDeliveryLog: {
      createMany: async (args) => {
        calls.createMany.push(args);
      },
    },
    pushSubscription: {
      deleteMany: async (args) => {
        calls.deleteMany.push(args);
      },
      updateMany: async (args) => {
        calls.updateMany.push(args);
      },
    },
  };
  return { db, calls };
}

describe("classifyOutcome", () => {
  it("maps statuses to the action the worker must take", () => {
    expect(classifyOutcome(true, undefined)).toBe("ok");
    expect(classifyOutcome(false, 404)).toBe("gone");
    expect(classifyOutcome(false, 410)).toBe("gone");
    for (const s of [400, 401, 403, 413]) expect(classifyOutcome(false, s)).toBe("permanent");
    expect(classifyOutcome(false, 429)).toBe("transient");
    expect(classifyOutcome(false, 500)).toBe("transient");
    expect(classifyOutcome(false, undefined)).toBe("transient");
  });
});

describe("deliverToSubscriptions", () => {
  it("produces one log per subscription and classifies each outcome", async () => {
    const send = vi.fn(async (s: DeliverableSubscription) => {
      if (s.id === "gone") throw httpError(410);
      if (s.id === "perm") throw httpError(403);
      if (s.id === "flaky") throw httpError(500);
    });
    const effects = await deliverToSubscriptions({
      subscriptions: [sub("ok"), sub("gone"), sub("perm", 1), sub("flaky")],
      payload: PAYLOAD,
      badgeByRecipient: new Map([["u1", 3]]),
      fallbackUrl: "/dashboard",
      send,
      retryBackoffMs: 0,
    });

    expect(effects.logs).toHaveLength(4);
    expect(effects.counts).toEqual({ ok: 1, gone: 1, permanent: 1, transient: 1 });
    expect(effects.successIds).toEqual(["ok"]);
    expect(effects.goneIds).toEqual(["gone"]);
    expect(effects.permanentFailures).toEqual([{ id: "perm", statusCode: 403, failCount: 2 }]);
    // transient: retried, then logged as failed with no row-level effect
    const flaky = effects.logs.find((l) => l.subscriptionId === "flaky")!;
    expect(flaky.ok).toBe(false);
    expect(flaky.statusCode).toBe(500);
    expect(send.mock.calls.filter(([s]) => s.id === "flaky").length).toBeGreaterThan(1);
    // 403 is NOT retried (it will never succeed)
    expect(send.mock.calls.filter(([s]) => s.id === "perm").length).toBe(1);
  });

  it("puts the recipient's unread count in the body as the badge", async () => {
    let body = "";
    await deliverToSubscriptions({
      subscriptions: [sub("a", 0, "u9")],
      payload: PAYLOAD,
      badgeByRecipient: new Map([["u9", 7]]),
      fallbackUrl: "/dashboard",
      send: async (_s, b) => {
        body = b;
      },
    });
    expect(JSON.parse(body).badge).toBe(7);
  });

  it("bounds concurrent sends", async () => {
    let inFlight = 0;
    let peak = 0;
    const subs = Array.from({ length: 50 }, (_, i) => sub(`s${i}`));
    await deliverToSubscriptions({
      subscriptions: subs,
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      fallbackUrl: "/",
      concurrency: 5,
      send: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
      },
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("applyDeliveryEffects", () => {
  it("deletes gone rows, increments permanent failures, resets successes", async () => {
    const { db, calls } = fakeDb();
    const effects = await deliverToSubscriptions({
      subscriptions: [sub("ok", 2), sub("gone"), sub("perm", 0)],
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      fallbackUrl: "/",
      send: async (s) => {
        if (s.id === "gone") throw httpError(410);
        if (s.id === "perm") throw httpError(401);
      },
    });
    const now = new Date("2026-09-16T12:00:00Z");
    await applyDeliveryEffects(db, effects, now);

    expect(calls.createMany).toHaveLength(1);
    expect(calls.updateMany).toEqual(
      expect.arrayContaining([
        { where: { id: { in: ["ok"] } }, data: { failCount: 0, lastSuccessAt: now } },
        {
          where: { id: { in: ["perm"] } },
          data: { failCount: { increment: 1 }, lastFailureAt: now, lastFailureStatus: 401 },
        },
      ]),
    );
    expect(calls.deleteMany).toEqual([{ where: { id: { in: ["gone"] } } }]);
  });

  it("retires a subscription once its permanent failures reach the threshold — not before", async () => {
    const atLimit = sub("almost", PUSH_MAX_FAIL_COUNT - 1);
    const fresh = sub("fresh", 0);
    const effects = await deliverToSubscriptions({
      subscriptions: [atLimit, fresh],
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      fallbackUrl: "/",
      send: async () => {
        throw httpError(403);
      },
    });
    expect(retiredIds(effects)).toEqual(["almost"]);

    const { db, calls } = fakeDb();
    await applyDeliveryEffects(db, effects);
    expect(calls.deleteMany).toEqual([{ where: { id: { in: ["almost"] } } }]);
  });

  it("does nothing destructive for transient failures", async () => {
    const effects = await deliverToSubscriptions({
      subscriptions: [sub("a")],
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      fallbackUrl: "/",
      retryBackoffMs: 0,
      send: async () => {
        throw httpError(503);
      },
    });
    const { db, calls } = fakeDb();
    await applyDeliveryEffects(db, effects);
    expect(calls.deleteMany).toEqual([]);
    expect(calls.updateMany).toEqual([]);
    expect(calls.createMany).toHaveLength(1);
  });
});

describe("mapWithConcurrency / p95", () => {
  it("preserves order and handles empty input", async () => {
    expect(await mapWithConcurrency([], 3, async (x: number) => x)).toEqual([]);
    const out = await mapWithConcurrency([3, 1, 2], 2, async (x) => {
      await new Promise((r) => setTimeout(r, x));
      return x * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it("computes p95", () => {
    expect(p95([])).toBeNull();
    expect(p95([5])).toBe(5);
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(96);
  });
});

describe("job shapes", () => {
  it("accepts v1 and v2 jobs and rejects garbage", () => {
    expect(parsePushJob({ recipientIds: ["a", "b"], payload: PAYLOAD })).toEqual({
      batchId: null,
      chunk: 0,
      recipientIds: ["a", "b"],
      payload: PAYLOAD,
    });
    expect(
      parsePushJob({ v: 2, batchId: "B", chunk: 3, recipientIds: ["a"], payload: PAYLOAD }),
    ).toEqual({ batchId: "B", chunk: 3, recipientIds: ["a"], payload: PAYLOAD });
    expect(parsePushJob(null)).toBeNull();
    expect(parsePushJob({ recipientIds: "nope", payload: PAYLOAD })).toBeNull();
    expect(parsePushJob({ recipientIds: ["a"], payload: { body: "no title" } })).toBeNull();
    expect(parsePushJob({ recipientIds: ["a", 5, ""], payload: PAYLOAD })?.recipientIds).toEqual(["a"]);
  });

  it("chunks recipients, de-duplicates, and derives deterministic job ids", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `u${i}`);
    const chunks = chunkRecipients([...ids, "u0", "u1"]);
    expect(chunks.map((c) => c.length)).toEqual([PUSH_JOB_CHUNK_SIZE, PUSH_JOB_CHUNK_SIZE, 20]);

    const jobs = buildPushJobs("batch-1", ids, PAYLOAD);
    expect(jobs.map((j) => j.jobId)).toEqual(["batch-1-0", "batch-1-1", "batch-1-2"]);
    expect(jobs[1].data).toMatchObject({ v: 2, batchId: "batch-1", chunk: 1 });
    expect(pushJobId("x", 4)).toBe("x-4");
    expect(pushJobId("x", 4)).not.toContain(":");
  });
});

describe("outbox dispatcher", () => {
  function fakeQueue() {
    const added = new Map<string, unknown>();
    const queue: QueueLike = {
      add: async (_name, data, opts) => {
        // BullMQ semantics: same jobId => no-op.
        if (!added.has(opts.jobId)) added.set(opts.jobId, data);
      },
    };
    return { queue, added };
  }

  function row(batchId: string, n: number): OutboxRow {
    return {
      id: `row-${batchId}`,
      batchId,
      recipientIds: Array.from({ length: n }, (_, i) => `u${i}`),
      payload: PAYLOAD,
      attempts: 0,
    };
  }

  it("enqueues one job per chunk and is idempotent on re-dispatch", async () => {
    const { queue, added } = fakeQueue();
    expect(await enqueueOutboxRow(queue, row("b1", 75))).toBe(2);
    expect(await enqueueOutboxRow(queue, row("b1", 75))).toBe(2);
    expect(added.size).toBe(2);
  });

  it("skips unusable rows", async () => {
    const { queue, added } = fakeQueue();
    expect(await enqueueOutboxRow(queue, { ...row("b", 3), payload: { nope: 1 } })).toBe(0);
    expect(await enqueueOutboxRow(queue, { ...row("b", 3), recipientIds: [] })).toBe(0);
    expect(added.size).toBe(0);
  });

  it("marks rows dispatched only when the queue accepted them", async () => {
    const updates: unknown[] = [];
    const db: OutboxDb = {
      pushOutbox: {
        findMany: async () => [],
        updateMany: async (args) => {
          updates.push(args);
        },
      },
    };
    let fail = true;
    const queue: QueueLike = {
      add: async () => {
        if (fail) throw new Error("ECONNREFUSED");
      },
    };
    const now = new Date();
    const r1 = await dispatchOutboxRows(queue, db, [row("b1", 2)], now);
    expect(r1).toEqual({ rows: 0, jobs: 0 });
    expect(updates).toEqual([]);

    fail = false;
    const r2 = await dispatchOutboxRows(queue, db, [row("b1", 2), row("b2", 60)], now);
    expect(r2).toEqual({ rows: 2, jobs: 3 });
    expect(updates).toEqual([
      {
        where: { id: { in: ["row-b1", "row-b2"] } },
        data: { dispatchedAt: now, attempts: { increment: 1 } },
      },
    ]);
  });

  it("sweep only picks undispatched rows older than the minimum age", async () => {
    const seen: unknown[] = [];
    const db: OutboxDb = {
      pushOutbox: {
        findMany: async (args) => {
          seen.push(args);
          return [row("old", 1)];
        },
        updateMany: async () => {},
      },
    };
    const { queue, added } = fakeQueue();
    const now = new Date("2026-09-16T12:00:00Z");
    const res = await sweepOutbox(queue, db, { now, minAgeMs: 30_000, limit: 10 });
    expect(res).toEqual({ rows: 1, jobs: 1 });
    expect(added.has("old-0")).toBe(true);
    expect(seen[0]).toEqual({
      where: { dispatchedAt: null, createdAt: { lt: new Date(now.getTime() - 30_000) } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
  });
});
