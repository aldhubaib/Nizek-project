import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { Prisma } from "@/generated/prisma/client";
import {
  MESSAGE_EVENTS_QUEUE_NAME,
  MESSAGE_EVENT_SWEEP_MAX_AGE_MS,
  enqueueMessageEvents,
  type MessageEventBacklog,
  type MessageEventKind,
  type MessageEventPayload,
  type MessageEventQueueLike,
  type MessageEventRowLite,
} from "@/lib/message-events-core";

const globalForQueue = globalThis as unknown as {
  messageEventQueue: Queue | undefined;
};

function getQueue(): Queue {
  if (!globalForQueue.messageEventQueue) {
    globalForQueue.messageEventQueue = new Queue(MESSAGE_EVENTS_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return globalForQueue.messageEventQueue;
}

// Redis has enableOfflineQueue=false so add() rejects at once when Redis is
// down; this bound covers the slow (not down) case so a send never waits long.
const QUEUE_OP_TIMEOUT_MS = 3_000;

const queueAdapter: MessageEventQueueLike = {
  add: (name, data, opts) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      getQueue().add(name, data, opts),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Queueing the message event timed out after ${QUEUE_OP_TIMEOUT_MS}ms`)),
          QUEUE_OP_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  },
};

type EventWriter = Pick<Prisma.TransactionClient, "messageEvent">;

/**
 * Records a chat event in the outbox. Call inside the same transaction that
 * creates / updates / deletes the message, so the event exists exactly when
 * the message change does. Returns the row for dispatchMessageEvents().
 */
export async function writeMessageEvent(
  tx: EventWriter,
  input: { kind: MessageEventKind; messageId: string; payload: MessageEventPayload },
): Promise<MessageEventRowLite> {
  return tx.messageEvent.create({
    data: {
      kind: input.kind,
      messageId: input.messageId,
      payload: input.payload as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, attempts: true },
  });
}

/**
 * Hands committed event rows to the worker queue. Failure is not fatal: the
 * worker sweeps unprocessed rows every 20s and picks them up.
 */
export async function dispatchMessageEvents(
  rows: (MessageEventRowLite | null | undefined)[],
): Promise<void> {
  const real = rows.filter((r): r is MessageEventRowLite => r != null);
  if (real.length === 0) return;
  try {
    await enqueueMessageEvents(queueAdapter, real);
  } catch (err) {
    console.error(
      "[message-events] enqueue failed (worker sweep will retry):",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Outbox backlog for the admin push-health page. Never throws. */
export async function getMessageEventBacklog(): Promise<MessageEventBacklog> {
  try {
    const now = Date.now();
    const [oldest, pending, stuck] = await Promise.all([
      prisma.messageEvent.findFirst({
        where: { processedAt: null },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.messageEvent.count({ where: { processedAt: null } }),
      prisma.messageEvent.count({
        where: {
          processedAt: null,
          createdAt: { lt: new Date(now - MESSAGE_EVENT_SWEEP_MAX_AGE_MS) },
        },
      }),
    ]);
    return {
      pending,
      oldestAgeMs: oldest ? now - oldest.createdAt.getTime() : null,
      stuck,
    };
  } catch {
    return { pending: 0, oldestAgeMs: null, stuck: 0 };
  }
}
