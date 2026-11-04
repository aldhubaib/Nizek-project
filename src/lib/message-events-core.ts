// Message event outbox: the pure parts shared by the Next.js app (write +
// enqueue after commit) and the worker (process + sweep). No Next, Prisma or
// Redis imports, so this is unit testable and safe to copy into the worker.
//
// A MessageEvent row is written in the same transaction as the chat message
// it describes. Its payload is everything the worker needs to (1) publish the
// realtime events to Centrifugo and (2) run the side effects — notifications,
// unread cursors, inbox previews. The web process never does either directly
// any more, so a Centrifugo hiccup or a replica restart cannot lose them.

export const MESSAGE_EVENTS_QUEUE_NAME = "message-events";

/** Rows younger than this are left to the request that created them. */
export const MESSAGE_EVENT_SWEEP_MIN_AGE_MS = 20_000;
export const MESSAGE_EVENT_SWEEP_LIMIT = 500;
/** Unprocessed rows older than this are not re-enqueued (surfaced on /health as stuck). */
export const MESSAGE_EVENT_SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Processed rows are kept this long for debugging, then pruned by the daily cron. */
export const MESSAGE_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
/** BullMQ attempts per job (exponential backoff from 1s: 1, 2, 4, 8, 16s). */
export const MESSAGE_EVENT_JOB_ATTEMPTS = 5;
export const MESSAGE_EVENT_BACKOFF_MS = 1_000;

export type MessageEventKind =
  | "message.new"
  | "message.updated"
  | "message.deleted"
  | "reaction.updated";

/** One realtime publish: the same data to one or more channels. */
export type MessageEventPublish = { channels: string[]; data: unknown };

/** Input of fanOutMessageSideEffects, with the Date serialised. */
export type MessageEventFanOut = {
  conversationId: string | null;
  projectId: string | null;
  taskId: string | null;
  userId: string;
  isClientRoom: boolean;
  participantIds: string[];
  uniqueRecipients: string[];
  mentionedIds?: string[];
  notifyType: string;
  title: string;
  notifBody: string;
  url: string;
  threadId: string;
  authorName: string;
  preview: string;
  notifIcon: string | undefined;
  /** ISO timestamp of the message row. */
  messageCreatedAt: string;
  asBot?: boolean;
};

export type MessageEventPayload = {
  v: 1;
  publishes: MessageEventPublish[];
  fanOut?: MessageEventFanOut;
};

export type MessageEventJob = { eventId: string };

export interface MessageEventQueueLike {
  add(
    name: string,
    data: MessageEventJob,
    opts: {
      jobId: string;
      attempts?: number;
      backoff?: { type: "exponential"; delay: number };
    },
  ): Promise<unknown>;
}

export interface MessageEventRowLite {
  id: string;
  attempts: number;
}

export interface MessageEventDb {
  messageEvent: {
    findMany(args: {
      where: { processedAt: null; createdAt: { lt: Date; gt: Date } };
      orderBy: { createdAt: "asc" };
      take: number;
    }): Promise<MessageEventRowLite[]>;
  };
}

/**
 * Job id for a row. Includes the attempt counter so that once a job has
 * exhausted its BullMQ retries (and sits in the failed set under the old id),
 * the sweep can still hand the row back to the worker under a fresh id.
 */
export function messageEventJobId(row: MessageEventRowLite): string {
  return `evt-${row.id}-${row.attempts}`;
}

/** Centrifugo idempotency key for publish `index` of an event. */
export function publishIdempotencyKey(eventId: string, index: number): string {
  return `${eventId}:${index}`;
}

/** Enqueue rows (deterministic job ids, so double-enqueue cannot double-process). */
export async function enqueueMessageEvents(
  queue: MessageEventQueueLike,
  rows: MessageEventRowLite[],
): Promise<number> {
  let added = 0;
  for (const row of rows) {
    await queue.add(
      "process",
      { eventId: row.id },
      {
        jobId: messageEventJobId(row),
        attempts: MESSAGE_EVENT_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: MESSAGE_EVENT_BACKOFF_MS },
      },
    );
    added++;
  }
  return added;
}

/** Re-enqueue unprocessed rows the request path failed to hand to Redis. */
export async function sweepMessageEvents(
  queue: MessageEventQueueLike,
  db: MessageEventDb,
  opts: { now?: Date; minAgeMs?: number; maxAgeMs?: number; limit?: number } = {},
): Promise<{ rows: number }> {
  const now = opts.now ?? new Date();
  const rows = await db.messageEvent.findMany({
    where: {
      processedAt: null,
      createdAt: {
        lt: new Date(now.getTime() - (opts.minAgeMs ?? MESSAGE_EVENT_SWEEP_MIN_AGE_MS)),
        gt: new Date(now.getTime() - (opts.maxAgeMs ?? MESSAGE_EVENT_SWEEP_MAX_AGE_MS)),
      },
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? MESSAGE_EVENT_SWEEP_LIMIT,
  });
  let enqueued = 0;
  for (const row of rows) {
    try {
      enqueued += await enqueueMessageEvents(queue, [row]);
    } catch (err) {
      console.error(
        `[message-events] sweep enqueue failed for ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { rows: enqueued };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Validates a stored payload. Returns null for anything the worker cannot act on. */
export function parseMessageEventPayload(raw: unknown): MessageEventPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<MessageEventPayload>;
  if (p.v !== 1) return null;
  if (!Array.isArray(p.publishes)) return null;
  const publishes: MessageEventPublish[] = [];
  for (const item of p.publishes) {
    if (!item || typeof item !== "object") return null;
    const pub = item as Partial<MessageEventPublish>;
    if (!isStringArray(pub.channels)) return null;
    publishes.push({ channels: pub.channels.filter(Boolean), data: pub.data });
  }
  let fanOut: MessageEventFanOut | undefined;
  if (p.fanOut !== undefined) {
    const f = p.fanOut as Partial<MessageEventFanOut> | null;
    if (
      !f ||
      typeof f !== "object" ||
      typeof f.userId !== "string" ||
      typeof f.threadId !== "string" ||
      typeof f.messageCreatedAt !== "string" ||
      !isStringArray(f.participantIds) ||
      !isStringArray(f.uniqueRecipients)
    ) {
      return null;
    }
    fanOut = {
      conversationId: typeof f.conversationId === "string" ? f.conversationId : null,
      projectId: typeof f.projectId === "string" ? f.projectId : null,
      taskId: typeof f.taskId === "string" ? f.taskId : null,
      userId: f.userId,
      isClientRoom: Boolean(f.isClientRoom),
      participantIds: f.participantIds,
      uniqueRecipients: f.uniqueRecipients,
      mentionedIds: isStringArray(f.mentionedIds) ? f.mentionedIds : [],
      notifyType: typeof f.notifyType === "string" ? f.notifyType : "message",
      title: typeof f.title === "string" ? f.title : "",
      notifBody: typeof f.notifBody === "string" ? f.notifBody : "",
      url: typeof f.url === "string" ? f.url : "/dashboard/messages",
      threadId: f.threadId,
      authorName: typeof f.authorName === "string" ? f.authorName : "Someone",
      preview: typeof f.preview === "string" ? f.preview : "",
      notifIcon: typeof f.notifIcon === "string" ? f.notifIcon : undefined,
      messageCreatedAt: f.messageCreatedAt,
      asBot: f.asBot === true ? true : undefined,
    };
  }
  return { v: 1, publishes, fanOut };
}

/** Health summary of the outbox for /health and the admin page. */
export type MessageEventBacklog = {
  /** Rows not yet processed. */
  pending: number;
  /** Age of the oldest unprocessed row, or null when there is none. */
  oldestAgeMs: number | null;
  /** Unprocessed rows older than the sweep window — need a human. */
  stuck: number;
};
