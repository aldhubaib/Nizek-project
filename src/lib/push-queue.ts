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
