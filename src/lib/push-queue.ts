import "server-only";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { PushPayload } from "@/lib/push-core";
import {
  dispatchOutboxRows,
  type OutboxRow,
  type QueueLike,
} from "@/lib/push/outbox-core";
import type { Prisma } from "@/generated/prisma/client";

export const PUSH_QUEUE_NAME = "push-notifications";

const globalForQueue = globalThis as unknown as {
  pushQueue: Queue | undefined;
};

function getQueue(): Queue {
  if (!globalForQueue.pushQueue) {
    globalForQueue.pushQueue = new Queue(PUSH_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return globalForQueue.pushQueue;
}

// The Redis connection has enableOfflineQueue=false, so add() rejects at once
// when Redis is down instead of buffering forever. This bound covers the slow
// (not down) case so a request never waits on the queue for long.
const QUEUE_OP_TIMEOUT_MS = 3_000;

async function withQueueTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${QUEUE_OP_TIMEOUT_MS}ms`)),
          QUEUE_OP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const queueAdapter: QueueLike = {
  add: (name, data, opts) =>
    withQueueTimeout(getQueue().add(name, data, opts), "Queueing the notification"),
};

type OutboxWriter = Pick<Prisma.TransactionClient, "pushOutbox">;

/**
 * Records a push in the outbox. Call inside the same transaction that creates
 * the Notification rows so a push can never exist without its notification (or
 * vice versa). Returns the row for dispatchOutbox() after commit.
 */
export async function writePushOutbox(
  tx: OutboxWriter,
  recipientIds: string[],
  payload: PushPayload,
): Promise<OutboxRow | null> {
  const unique = [...new Set(recipientIds)].filter(Boolean);
  if (unique.length === 0) return null;
  const row = await tx.pushOutbox.create({
    data: {
      batchId: randomUUID(),
      recipientIds: unique,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, batchId: true, recipientIds: true, payload: true, attempts: true },
  });
  return row;
}

/**
 * Hands committed outbox rows to the worker queue. Failure here is not fatal:
 * the worker sweeps undispatched rows every 30s and picks them up.
 */
export async function dispatchOutbox(rows: (OutboxRow | null)[]): Promise<void> {
  const real = rows.filter((r): r is OutboxRow => r !== null);
  if (real.length === 0) return;
  try {
    await dispatchOutboxRows(queueAdapter, prisma, real);
  } catch (err) {
    console.error(
      "[push] outbox dispatch failed (worker sweep will retry):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Enqueue a push for recipients who already have their Notification rows (or
 * need none). Durable: the outbox row is written first, so a Redis outage
 * delays the push instead of dropping it. Never throws.
 */
export async function enqueuePush(
  recipientIds: string[],
  payload: PushPayload,
): Promise<void> {
  let row: OutboxRow | null = null;
  try {
    row = await writePushOutbox(prisma, recipientIds, payload);
  } catch (err) {
    console.error(
      "[push] outbox write failed:",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  await dispatchOutbox([row]);
}

/**
 * enqueuePush for request paths that want to know whether the push is at
 * least durably recorded. Throws only when even the outbox write fails.
 */
export async function enqueuePushBounded(
  recipientIds: string[],
  payload: PushPayload,
): Promise<void> {
  const row = await writePushOutbox(prisma, recipientIds, payload);
  await dispatchOutbox([row]);
}

export interface PushQueueHealth {
  /** False when the queue itself is unreachable (Redis down/misconfigured). */
  reachable: boolean;
  waiting: number;
  active: number;
  failed: number;
  /** When the worker last finished a job, or null if it never has. */
  lastCompletedAt: Date | null;
  /** Outbox rows not yet handed to Redis, and how old the oldest is. */
  outboxPending: number;
  outboxOldestAgeMs: number | null;
}

/**
 * Queue-side view of push delivery. Every real notification goes through this
 * queue, so a dead worker means no notifications at all — a failure the
 * per-device checks cannot see.
 */
export async function getPushQueueHealth(): Promise<PushQueueHealth> {
  const outbox = await prisma.pushOutbox
    .findFirst({
      where: { dispatchedAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    })
    .then(async (oldest) => ({
      pending: oldest
        ? await prisma.pushOutbox.count({ where: { dispatchedAt: null } })
        : 0,
      oldestAgeMs: oldest ? Date.now() - oldest.createdAt.getTime() : null,
    }))
    .catch(() => ({ pending: 0, oldestAgeMs: null }));

  try {
    const queue = getQueue();
    const [counts, completed] = await withQueueTimeout(
      Promise.all([
        queue.getJobCounts("waiting", "active", "failed"),
        // Descending by default, so index 0 is the most recent completion.
        queue.getCompleted(0, 0),
      ]),
      "Reading queue health",
    );
    const finishedOn = completed[0]?.finishedOn;
    return {
      reachable: true,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      lastCompletedAt: finishedOn ? new Date(finishedOn) : null,
      outboxPending: outbox.pending,
      outboxOldestAgeMs: outbox.oldestAgeMs,
    };
  } catch {
    return {
      reachable: false,
      waiting: 0,
      active: 0,
      failed: 0,
      lastCompletedAt: null,
      outboxPending: outbox.pending,
      outboxOldestAgeMs: outbox.oldestAgeMs,
    };
  }
}
