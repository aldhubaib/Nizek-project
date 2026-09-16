// Outbox dispatch, shared by the Next.js app (dispatch right after commit) and
// the worker (periodic sweep for rows that never made it to Redis). Database
// and queue are injected so this stays free of Next/Prisma imports and is
// unit testable.

import { buildPushJobs, type PushJobV2, type PushPayload } from "../push-core";

export interface QueueLike {
  add(
    name: string,
    data: PushJobV2,
    opts: { jobId: string; priority?: number },
  ): Promise<unknown>;
}

export interface OutboxRow {
  id: string;
  batchId: string;
  recipientIds: unknown;
  payload: unknown;
  attempts: number;
}

export interface OutboxDb {
  pushOutbox: {
    findMany(args: {
      where: { dispatchedAt: null; createdAt: { lt: Date } };
      orderBy: { createdAt: "asc" };
      take: number;
    }): Promise<OutboxRow[]>;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: { dispatchedAt?: Date; attempts?: { increment: number } };
    }): Promise<unknown>;
  };
}

/** Rows younger than this are left to the request that created them. */
export const OUTBOX_SWEEP_MIN_AGE_MS = 30_000;
export const OUTBOX_SWEEP_LIMIT = 500;
/** Rows dispatched longer ago than this can be deleted (by the daily cron). */
export const OUTBOX_RETENTION_MS = 24 * 60 * 60 * 1000;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
}

function asPayload(v: unknown): PushPayload | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<PushPayload>;
  if (typeof p.title !== "string") return null;
  return p as PushPayload;
}

/**
 * Enqueues every chunk of one outbox row. Job ids are deterministic, so calling
 * this twice for the same row (request + sweep racing, or a crash between
 * enqueue and the dispatchedAt update) cannot double-send.
 */
export async function enqueueOutboxRow(
  queue: QueueLike,
  row: OutboxRow,
): Promise<number> {
  const recipientIds = asStringArray(row.recipientIds);
  const payload = asPayload(row.payload);
  if (!payload || recipientIds.length === 0) return 0;

  const jobs = buildPushJobs(row.batchId, recipientIds, payload);
  await Promise.all(
    jobs.map((j) =>
      queue.add("send", j.data, {
        jobId: j.jobId,
        priority: payload.type === "test" ? 1 : 2,
      }),
    ),
  );
  return jobs.length;
}

/** Enqueue + mark dispatched. Throws if the queue is unreachable (row stays undispatched). */
export async function dispatchOutboxRows(
  queue: QueueLike,
  db: OutboxDb,
  rows: OutboxRow[],
  now: Date = new Date(),
): Promise<{ rows: number; jobs: number }> {
  if (rows.length === 0) return { rows: 0, jobs: 0 };
  let jobs = 0;
  const done: string[] = [];
  for (const row of rows) {
    try {
      jobs += await enqueueOutboxRow(queue, row);
      done.push(row.id);
    } catch (err) {
      console.error(
        `[push] outbox ${row.batchId} dispatch failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (done.length > 0) {
    await db.pushOutbox.updateMany({
      where: { id: { in: done } },
      data: { dispatchedAt: now, attempts: { increment: 1 } },
    });
  }
  return { rows: done.length, jobs };
}

/** Re-dispatch rows the request path failed to hand to Redis. */
export async function sweepOutbox(
  queue: QueueLike,
  db: OutboxDb,
  opts: { now?: Date; minAgeMs?: number; limit?: number } = {},
): Promise<{ rows: number; jobs: number }> {
  const now = opts.now ?? new Date();
  const rows = await db.pushOutbox.findMany({
    where: {
      dispatchedAt: null,
      createdAt: { lt: new Date(now.getTime() - (opts.minAgeMs ?? OUTBOX_SWEEP_MIN_AGE_MS)) },
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? OUTBOX_SWEEP_LIMIT,
  });
  return dispatchOutboxRows(queue, db, rows, now);
}
