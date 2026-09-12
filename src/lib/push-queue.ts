import "server-only";
import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";
import type { PushPayload } from "@/lib/push-core";

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
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return globalForQueue.pushQueue;
}

export type PushJobData = {
  recipientIds: string[];
  payload: PushPayload;
};

/**
 * Enqueue a push notification job. The web server returns immediately; the
 * worker process picks up the job from Redis and fans out to all devices.
 */
export async function enqueuePush(
  recipientIds: string[],
  payload: PushPayload,
): Promise<void> {
  const unique = [...new Set(recipientIds)].filter(Boolean);
  if (unique.length === 0) return;

  await getQueue().add(
    "send",
    { recipientIds: unique, payload } satisfies PushJobData,
    { priority: payload.type === "test" ? 1 : 2 },
  );
}

/**
 * BullMQ requires `maxRetriesPerRequest: null`, so commands issued against an
 * unreachable Redis queue up forever instead of failing. Anything a request is
 * waiting on therefore has to be bounded, or the page just spins.
 */
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

/**
 * enqueuePush for request paths that await the result. Fails fast instead of
 * hanging when the queue is unreachable, so the caller can say so.
 */
export async function enqueuePushBounded(
  recipientIds: string[],
  payload: PushPayload,
): Promise<void> {
  return withQueueTimeout(
    enqueuePush(recipientIds, payload),
    "Queueing the notification",
  );
}

export interface PushQueueHealth {
  /** False when the queue itself is unreachable (Redis down/misconfigured). */
  reachable: boolean;
  waiting: number;
  active: number;
  failed: number;
  /** When the worker last finished a job, or null if it never has. */
  lastCompletedAt: Date | null;
}

/**
 * Queue-side view of push delivery. Every real notification goes through this
 * queue, so a dead worker means no notifications at all — a failure the
 * per-device checks cannot see.
 */
export async function getPushQueueHealth(): Promise<PushQueueHealth> {
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
    };
  } catch {
    return {
      reachable: false,
      waiting: 0,
      active: 0,
      failed: 0,
      lastCompletedAt: null,
    };
  }
}
