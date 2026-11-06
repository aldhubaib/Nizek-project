/**
 * BullMQ push notification worker — runs as a separate Railway service.
 *
 * Start: node --import tsx worker.ts
 *
 * Two queues:
 *   - push-notifications: parse the job, load subscriptions, compute badges,
 *     then hand everything to src/lib/push/delivery.ts (the only place sends
 *     happen). Sweeps the PushOutbox every 30s so pushes the web app failed
 *     to enqueue (Redis blip, crash between commit and enqueue) still go out.
 *   - message-events: delivers chat events the web app wrote to the
 *     MessageEvent outbox in the same transaction as the message — the live
 *     Centrifugo broadcast (with idempotency keys) and the notification /
 *     unread-cursor / inbox-preview fan-out. Retries with backoff; a 20s sweep
 *     re-enqueues rows that never reached Redis.
 *
 * Shares Postgres with the Next.js app and Redis with BullMQ, on its own event
 * loop so fan-out never competes with page renders. Runs under tsx with
 * tsconfig.worker.json (for the `@/` alias and the `server-only` stub).
 */

import http from "node:http";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import webpush from "web-push";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "./src/lib/prisma.js";
import {
  activeThreadRedisKey,
  parsePushJob,
  partitionByActiveThread,
  PUSH_MAX_FAIL_COUNT,
  PUSH_TTL_SECONDS,
  threadKeyFromPushTag,
  mapWithConcurrency,
} from "./src/lib/push-core.js";
import {
  applyDeliveryEffects,
  deliverToSubscriptions,
  p95,
  type DeliverableSubscription,
} from "./src/lib/push/delivery.js";
import {
  applyExpoDeliveryEffects,
  deliverBadgeSync,
  deliverToExpoTokens,
  processExpoReceipts,
  type PendingReceipt,
} from "./src/lib/push/expo-delivery.js";
import {
  EXPO_RECEIPT_DELAY_MS,
  type ExpoResult,
  type MobileTokenRow,
} from "./src/lib/mobile-push-core.js";
import { sumInboxMessageUnreads } from "./src/lib/inbox-unread.js";
import { sweepOutbox } from "./src/lib/push/outbox-core.js";
import {
  MESSAGE_EVENTS_QUEUE_NAME,
  MESSAGE_EVENT_SWEEP_MAX_AGE_MS,
  MESSAGE_EVENT_SWEEP_MIN_AGE_MS,
  parseMessageEventPayload,
  publishIdempotencyKey,
  sweepMessageEvents,
} from "./src/lib/message-events-core.js";
import { broadcast } from "./src/lib/centrifugo.js";
import {
  fanOutMessageSideEffects,
  notifyMessageRecipients,
} from "./src/lib/message-fanout.js";
import {
  EMAIL_DIGEST_QUEUE_NAME,
  enqueueEmailDigests,
  type EmailDigestJob,
} from "./src/lib/email-digest-core.js";
import { processEmailDigest } from "./src/lib/email-digest.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "push-notifications";
/** Jobs processed in parallel. Each job sends to <= 50 recipients' devices. */
const CONCURRENCY = Number(process.env.PUSH_WORKER_CONCURRENCY ?? 10) || 10;
/** HTTPS sends in flight per job. */
const SEND_CONCURRENCY = Number(process.env.PUSH_SEND_CONCURRENCY ?? 20) || 20;
const OUTBOX_SWEEP_INTERVAL_MS =
  Number(process.env.PUSH_OUTBOX_SWEEP_MS ?? 30_000) || 30_000;
/** Chat events processed in parallel (each is one broadcast + one fan-out). */
const MESSAGE_EVENT_CONCURRENCY =
  Number(process.env.MESSAGE_EVENT_CONCURRENCY ?? 8) || 8;
const MESSAGE_EVENT_SWEEP_INTERVAL_MS =
  Number(process.env.MESSAGE_EVENT_SWEEP_MS ?? MESSAGE_EVENT_SWEEP_MIN_AGE_MS) ||
  MESSAGE_EVENT_SWEEP_MIN_AGE_MS;

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const vapidConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (vapidConfigured) {
  webpush.setVapidDetails("mailto:admin@nizek.com", VAPID_PUBLIC!, VAPID_PRIVATE!);
  console.log("[worker] VAPID configured — web push delivery enabled");
} else {
  console.warn("[worker] VAPID keys missing — web push delivery DISABLED");
}

// Expo push (native mobile app). Works without a token; EXPO_ACCESS_TOKEN is
// only needed once "Enhanced Security for Push Notifications" is turned on
// for the Expo project.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  maxConcurrentRequests: 6,
});
const sendExpo = (messages: unknown[]) =>
  expo.sendPushNotificationsAsync(messages as ExpoPushMessage[]) as Promise<ExpoResult[]>;
const fetchExpoReceipts = (ids: string[]) =>
  expo.getPushNotificationReceiptsAsync(ids) as Promise<Record<string, ExpoResult>>;
console.log(
  `[worker] Expo push enabled (${process.env.EXPO_ACCESS_TOKEN ? "with" : "without"} access token)`,
);

// ─── Postgres ────────────────────────────────────────────────────────────────
// The shared singleton from src/lib/prisma.ts: the message-events fan-out
// (notify, inbox previews, read cursors) runs through the same lib modules the
// web app uses, and they import that singleton — one pool for the process.
// Pool size comes from PG_POOL_MAX (default 10); it ends itself on SIGTERM.

// ─── Redis ───────────────────────────────────────────────────────────────────

const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});
redis.on("error", (err) => console.error("[worker] redis error:", err.message));

// ─── Metrics (per-minute log line + health JSON) ─────────────────────────────

const metrics = {
  jobs: 0,
  sends: 0,
  ok: 0,
  gone: 0,
  permanent: 0,
  transient: 0,
  /** Devices skipped because they were actively reading the thread. */
  suppressedActive: 0,
  jobsFailed: 0,
  latencies: [] as number[],
  /** Chat events delivered / failed since the last flush. */
  events: 0,
  eventsFailed: 0,
  /** Expo (mobile) sends since the last flush. */
  mobileSends: 0,
  mobileOk: 0,
  mobileGone: 0,
  mobileFailed: 0,
  mobileBadgeSyncs: 0,
};
let lastJobCompletedAt: number | null = null;
/** Since boot; surfaced on /health so "is suppression working?" has an answer. */
let activeSkippedTotal = 0;

function flushMetrics() {
  if (
    metrics.jobs === 0 &&
    metrics.jobsFailed === 0 &&
    metrics.events === 0 &&
    metrics.eventsFailed === 0 &&
    metrics.mobileBadgeSyncs === 0
  ) {
    return;
  }
  console.log(
    `[worker] 1m jobs=${metrics.jobs} failedJobs=${metrics.jobsFailed} sends=${metrics.sends} ` +
      `ok=${metrics.ok} gone=${metrics.gone} permanent=${metrics.permanent} ` +
      `transient=${metrics.transient} activeSkipped=${metrics.suppressedActive} ` +
      `p95=${p95(metrics.latencies) ?? "-"}ms ` +
      `mobile=${metrics.mobileSends}/${metrics.mobileOk}ok/${metrics.mobileGone}gone/${metrics.mobileFailed}failed ` +
      `badgeSyncs=${metrics.mobileBadgeSyncs} ` +
      `events=${metrics.events} failedEvents=${metrics.eventsFailed}`,
  );
  metrics.events = 0;
  metrics.eventsFailed = 0;
  metrics.jobs = 0;
  metrics.sends = 0;
  metrics.ok = 0;
  metrics.gone = 0;
  metrics.permanent = 0;
  metrics.transient = 0;
  metrics.suppressedActive = 0;
  metrics.jobsFailed = 0;
  metrics.latencies = [];
  metrics.mobileSends = 0;
  metrics.mobileOk = 0;
  metrics.mobileGone = 0;
  metrics.mobileFailed = 0;
  metrics.mobileBadgeSyncs = 0;
}

/**
 * Which of these devices are currently reading a thread, straight from the
 * heartbeat keys (src/lib/active-thread.ts). Redis trouble means "nobody is",
 * so a push is never lost to a lookup failure — the device that is reading
 * just gets one banner it did not strictly need.
 */
async function loadActiveThreads(
  subscriptions: { memberId: string; deviceId: string | null }[],
): Promise<Map<string, string | null>> {
  const active = new Map<string, string | null>();
  const withDevice = subscriptions.filter((s) => s.deviceId);
  if (withDevice.length === 0) return active;
  try {
    const values = await redis.mget(
      withDevice.map((s) => activeThreadRedisKey(s.memberId, s.deviceId!)),
    );
    withDevice.forEach((s, i) => active.set(`${s.memberId}:${s.deviceId}`, values[i]));
  } catch (err) {
    console.error(
      "[worker] active-thread lookup failed; sending to every device:",
      err instanceof Error ? err.message : err,
    );
  }
  return active;
}
const metricsTimer = setInterval(flushMetrics, 60_000);
metricsTimer.unref();

// ─── Job processor ───────────────────────────────────────────────────────────

/** Badge jobs and receipt checks share the push queue under their own names. */
const MOBILE_BADGE_JOB = "mobile-badge";
const MOBILE_RECEIPTS_JOB = "mobile-receipts";
const PUSH_JOB = "send";

/**
 * The number on the phone's app icon: unread chat messages across the inbox,
 * the same figure the app's Chats tab shows. Never throws — a failed count
 * means "leave the badge alone" rather than "drop the push".
 */
async function inboxBadgeFor(userIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(userIds)];
  const entries = await mapWithConcurrency(unique, 4, async (id) => {
    try {
      return [id, await sumInboxMessageUnreads(id)] as const;
    } catch (err) {
      console.error(
        `[worker] inbox badge count failed for ${id}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  });
  const map = new Map<string, number>();
  for (const e of entries) if (e) map.set(e[0], e[1]);
  return map;
}

async function processPushJob(raw: unknown, jobId: string | undefined): Promise<void> {
  const job = parsePushJob(raw);
  if (!job) {
    console.error(`[worker] job ${jobId} has an unusable payload; dropping`);
    return;
  }
  if (job.recipientIds.length === 0) return;

  const [allSubscriptions, mobileTokens, grouped] = await Promise.all([
    vapidConfigured
      ? prisma.pushSubscription.findMany({
          where: {
            memberId: { in: job.recipientIds },
            failCount: { lt: PUSH_MAX_FAIL_COUNT },
          },
          select: {
            id: true,
            memberId: true,
            endpoint: true,
            p256dh: true,
            auth: true,
            failCount: true,
            deviceId: true,
          },
        })
      : Promise.resolve([]),
    prisma.mobilePushToken.findMany({
      where: {
        memberId: { in: job.recipientIds },
        failCount: { lt: PUSH_MAX_FAIL_COUNT },
      },
      select: {
        id: true,
        memberId: true,
        token: true,
        deviceId: true,
        platform: true,
        failCount: true,
      },
    }),
    prisma.notification.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: job.recipientIds }, read: false },
      _count: { _all: true },
    }),
  ]);
  if (allSubscriptions.length === 0 && mobileTokens.length === 0) return;

  // The one device already reading this thread gets no banner; every other
  // device of the same person still does (the service worker shows all pushes).
  const threadKey = threadKeyFromPushTag(job.payload.tag);
  const activeByDevice = threadKey
    ? await loadActiveThreads([...allSubscriptions, ...mobileTokens])
    : new Map<string, string | null>();

  if (mobileTokens.length > 0) {
    await deliverToMobile(mobileTokens, job.payload, threadKey, activeByDevice);
  }
  if (allSubscriptions.length === 0) return;

  const { send: subscriptions, suppressed } = partitionByActiveThread(
    allSubscriptions,
    threadKey,
    activeByDevice,
  );
  metrics.suppressedActive += suppressed.length;
  activeSkippedTotal += suppressed.length;
  if (subscriptions.length === 0) return;

  const badgeByRecipient = new Map(grouped.map((g) => [g.recipientId, g._count._all]));

  const effects = await deliverToSubscriptions({
    subscriptions: subscriptions as DeliverableSubscription[],
    payload: job.payload,
    badgeByRecipient,
    fallbackUrl: APP_URL || "/dashboard",
    concurrency: SEND_CONCURRENCY,
    send: (sub, body) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: PUSH_TTL_SECONDS, urgency: "high" },
        )
        .then(() => undefined),
  });

  await applyDeliveryEffects(prisma, effects);

  metrics.sends += subscriptions.length;
  metrics.ok += effects.counts.ok;
  metrics.gone += effects.counts.gone;
  metrics.permanent += effects.counts.permanent;
  metrics.transient += effects.counts.transient;
  metrics.latencies.push(...effects.latencies);

  const failed = subscriptions.length - effects.counts.ok;
  if (failed > 0) {
    console.error(
      `[worker] ${failed}/${subscriptions.length} sends failed ` +
        `(tag=${job.payload.tag ?? "-"} gone=${effects.counts.gone} ` +
        `permanent=${effects.counts.permanent} transient=${effects.counts.transient})`,
    );
  }
}

// ─── Mobile (Expo) delivery ──────────────────────────────────────────────────

type MobileTokenSelect = MobileTokenRow;

async function deliverToMobile(
  allTokens: MobileTokenSelect[],
  payload: Parameters<typeof deliverToExpoTokens>[0]["payload"],
  threadKey: string | null,
  activeByDevice: Map<string, string | null>,
): Promise<void> {
  const { send: tokens, suppressed } = partitionByActiveThread(
    allTokens,
    threadKey,
    activeByDevice,
  );
  metrics.suppressedActive += suppressed.length;
  activeSkippedTotal += suppressed.length;
  if (tokens.length === 0) return;

  const badgeByRecipient = await inboxBadgeFor(tokens.map((t) => t.memberId));
  const effects = await deliverToExpoTokens({
    tokens,
    payload,
    badgeByRecipient,
    send: sendExpo,
  });
  await applyExpoDeliveryEffects(prisma, effects);

  metrics.mobileSends += tokens.length;
  metrics.mobileOk += effects.counts.ok;
  metrics.mobileGone += effects.counts.gone;
  metrics.mobileFailed += effects.counts.permanent + effects.counts.transient;
  lastMobileSendAt = Date.now();

  const failed = tokens.length - effects.counts.ok;
  if (failed > 0) {
    console.error(
      `[worker] mobile: ${failed}/${tokens.length} sends failed ` +
        `(tag=${payload.tag ?? "-"} gone=${effects.counts.gone} ` +
        `permanent=${effects.counts.permanent} transient=${effects.counts.transient})`,
    );
  }
  if (effects.receipts.length > 0) await scheduleReceiptCheck(effects.receipts);
}

let lastMobileSendAt: number | null = null;
let lastReceiptCheck: { at: number; checked: number; gone: number; permanent: number } | null =
  null;

/**
 * APNs/FCM rejections (uninstalled app, revoked permission) only appear in
 * receipts, minutes after the send. One delayed job per send batch.
 */
async function scheduleReceiptCheck(receipts: PendingReceipt[]): Promise<void> {
  try {
    await sweepQueue.add(
      MOBILE_RECEIPTS_JOB,
      { receipts },
      {
        delay: EXPO_RECEIPT_DELAY_MS,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    );
  } catch (err) {
    // Not fatal: stale tokens are also caught by the next send's ticket.
    console.error(
      "[worker] could not schedule receipt check:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function processReceiptJob(raw: unknown): Promise<void> {
  const list = (raw as { receipts?: unknown } | null)?.receipts;
  if (!Array.isArray(list)) return;
  const pending = list.filter(
    (r): r is PendingReceipt =>
      !!r &&
      typeof r === "object" &&
      typeof (r as PendingReceipt).receiptId === "string" &&
      typeof (r as PendingReceipt).tokenId === "string" &&
      typeof (r as PendingReceipt).memberId === "string",
  );
  const result = await processExpoReceipts({
    pending,
    fetchReceipts: fetchExpoReceipts,
    db: prisma,
  });
  lastReceiptCheck = { at: Date.now(), ...result };
  if (result.gone > 0 || result.permanent > 0) {
    console.log(
      `[worker] receipts: ${result.checked} checked, ${result.gone} devices gone, ` +
        `${result.permanent} permanent failures`,
    );
  }
}

/**
 * The person read something on another device (web, second phone). Push the
 * new inbox total to their iPhones so the badge drops without opening the app.
 * Android badges follow the app itself, so those tokens are skipped.
 */
async function processBadgeSyncJob(raw: unknown): Promise<void> {
  const userId = (raw as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string" || !userId) return;
  const tokens = await prisma.mobilePushToken.findMany({
    where: { memberId: userId, platform: "ios", failCount: { lt: PUSH_MAX_FAIL_COUNT } },
    select: {
      id: true,
      memberId: true,
      token: true,
      deviceId: true,
      platform: true,
      failCount: true,
    },
  });
  if (tokens.length === 0) return;
  // A phone with a chat open right now is in the foreground and already keeps
  // its own badge in step with the inbox; only the pocketed ones need a push.
  const active = await loadActiveThreads(tokens);
  const idle = tokens.filter((t) => !active.get(`${t.memberId}:${t.deviceId}`));
  if (idle.length === 0) return;
  const badge = await sumInboxMessageUnreads(userId);
  const effects = await deliverBadgeSync({ tokens: idle, badge, send: sendExpo });
  await applyExpoDeliveryEffects(prisma, effects);
  metrics.mobileBadgeSyncs += 1;
  metrics.mobileGone += effects.counts.gone;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case MOBILE_BADGE_JOB:
        await processBadgeSyncJob(job.data);
        return;
      case MOBILE_RECEIPTS_JOB:
        await processReceiptJob(job.data);
        return;
      case PUSH_JOB:
      default:
        await processPushJob(job.data, job.id);
    }
  },
  {
    connection: redis,
    concurrency: CONCURRENCY,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
);

worker.on("completed", (job) => {
  metrics.jobs += 1;
  lastJobCompletedAt = Date.now();
  if (process.env.PUSH_WORKER_VERBOSE) console.log(`[worker] job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  metrics.jobsFailed += 1;
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});
worker.on("error", (err) => console.error("[worker] error:", err.message));

// ─── Outbox sweep ────────────────────────────────────────────────────────────
// Re-dispatches PushOutbox rows the web app never handed to Redis. Job ids are
// deterministic so overlapping sweeps (two replicas) cannot double-send; the
// lock just avoids redundant work.

const sweepQueue = new Queue(QUEUE_NAME, { connection: redis });
const SWEEP_LOCK_KEY = "push:outbox-sweep-lock";
let lastSweep: { at: number; rows: number; jobs: number } | null = null;

async function runOutboxSweep() {
  try {
    const locked = await redis.set(
      SWEEP_LOCK_KEY,
      String(process.pid),
      "PX",
      Math.max(1_000, OUTBOX_SWEEP_INTERVAL_MS - 1_000),
      "NX",
    );
    if (locked !== "OK") return;
    const result = await sweepOutbox(sweepQueue, prisma);
    lastSweep = { at: Date.now(), ...result };
    if (result.rows > 0) {
      console.log(`[worker] outbox sweep re-dispatched ${result.rows} rows (${result.jobs} jobs)`);
    }
  } catch (err) {
    console.error("[worker] outbox sweep failed:", err instanceof Error ? err.message : err);
  }
}
const sweepTimer = setInterval(runOutboxSweep, OUTBOX_SWEEP_INTERVAL_MS);
sweepTimer.unref();
setTimeout(runOutboxSweep, 5_000).unref();

// ─── Message events (chat outbox) ────────────────────────────────────────────
// Each row is delivered in stages, each stamped on the row, so a retry after a
// crash resumes where it stopped instead of repeating work:
//   publishedAt — Centrifugo broadcasts (idempotency_key makes repeats safe)
//   notifiedAt  — Notification rows + push outbox (NOT safe to repeat)
//   processedAt — the idempotent rest (conversation touch, read cursors,
//                 inbox previews) ran; the row is done.

let lastEventProcessedAt: number | null = null;

async function processMessageEvent(eventId: string): Promise<void> {
  const row = await prisma.messageEvent.findUnique({ where: { id: eventId } });
  if (!row || row.processedAt) return;

  const payload = parseMessageEventPayload(row.payload);
  if (!payload) {
    // Nothing a retry can fix; park it with the reason instead of looping.
    await prisma.messageEvent.update({
      where: { id: row.id },
      data: { processedAt: new Date(), lastError: "invalid payload" },
    });
    console.error(`[worker] message event ${row.id} (${row.kind}) has an invalid payload`);
    return;
  }

  try {
    if (!row.publishedAt) {
      for (const [index, pub] of payload.publishes.entries()) {
        if (pub.channels.length === 0) continue;
        await broadcast(pub.channels, pub.data, {
          idempotencyKey: publishIdempotencyKey(row.id, index),
          strict: true,
        });
      }
      await prisma.messageEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
    }

    if (payload.fanOut) {
      const input = {
        ...payload.fanOut,
        messageCreatedAt: new Date(payload.fanOut.messageCreatedAt),
      };
      if (!row.notifiedAt) {
        const created = await notifyMessageRecipients(input);
        await prisma.messageEvent.update({
          where: { id: row.id },
          data: { notifiedAt: new Date() },
        });
        // Email fallback: if these notifications are still unread in five
        // minutes, one email per person per thread. Best effort - a Redis
        // blip here must not re-run the notification step.
        if (created.length > 0) {
          try {
            await enqueueEmailDigests(
              digestQueue,
              created.map((n) => n.recipientId),
              input.threadId,
            );
          } catch (err) {
            console.error(
              "[worker] digest enqueue failed:",
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
      await fanOutMessageSideEffects(input, { skipNotifications: true });
    }

    await prisma.messageEvent.update({
      where: { id: row.id },
      data: { processedAt: new Date(), lastError: null },
    });
    lastEventProcessedAt = Date.now();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.messageEvent
      .update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
      })
      .catch(() => {});
    throw err;
  }
}

// --- Email digests -----------------------------------------------------------
// Delayed jobs scheduled by processMessageEvent; see src/lib/email-digest.ts.

const digestQueue = new Queue(EMAIL_DIGEST_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
});
const digestOutcomes: Record<string, number> = {};
const digestWorker = new Worker(
  EMAIL_DIGEST_QUEUE_NAME,
  async (job) => {
    const data = job.data as Partial<EmailDigestJob> | null;
    if (!data || typeof data.userId !== "string" || typeof data.threadKey !== "string") return;
    const outcome = await processEmailDigest({ userId: data.userId, threadKey: data.threadKey });
    digestOutcomes[outcome] = (digestOutcomes[outcome] ?? 0) + 1;
    if (outcome === "sent") console.log(`[worker] digest email sent (${data.threadKey})`);
  },
  {
    connection: redis,
    concurrency: 4,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
);
digestWorker.on("failed", (job, err) => {
  console.error(`[worker] digest job ${job?.id} failed:`, err.message);
});
digestWorker.on("error", (err) => console.error("[worker] email-digests error:", err.message));

const eventWorker = new Worker(
  MESSAGE_EVENTS_QUEUE_NAME,
  async (job) => {
    const eventId = (job.data as { eventId?: unknown } | null)?.eventId;
    if (typeof eventId !== "string" || !eventId) return;
    await processMessageEvent(eventId);
  },
  {
    connection: redis,
    concurrency: MESSAGE_EVENT_CONCURRENCY,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
);
eventWorker.on("completed", () => {
  metrics.events += 1;
});
eventWorker.on("failed", (job, err) => {
  metrics.eventsFailed += 1;
  console.error(`[worker] message event job ${job?.id} failed:`, err.message);
});
eventWorker.on("error", (err) => console.error("[worker] message-events error:", err.message));

const eventQueue = new Queue(MESSAGE_EVENTS_QUEUE_NAME, { connection: redis });
const EVENT_SWEEP_LOCK_KEY = "message-events:sweep-lock";
let lastEventSweep: { at: number; rows: number } | null = null;

async function runMessageEventSweep() {
  try {
    const locked = await redis.set(
      EVENT_SWEEP_LOCK_KEY,
      String(process.pid),
      "PX",
      Math.max(1_000, MESSAGE_EVENT_SWEEP_INTERVAL_MS - 1_000),
      "NX",
    );
    if (locked !== "OK") return;
    const result = await sweepMessageEvents(eventQueue, prisma);
    lastEventSweep = { at: Date.now(), ...result };
    if (result.rows > 0) {
      console.log(`[worker] message-events sweep re-enqueued ${result.rows} rows`);
    }
  } catch (err) {
    console.error(
      "[worker] message-events sweep failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
const eventSweepTimer = setInterval(runMessageEventSweep, MESSAGE_EVENT_SWEEP_INTERVAL_MS);
eventSweepTimer.unref();
setTimeout(runMessageEventSweep, 3_000).unref();

/** Outbox backlog for /health: how many rows wait, how old, how many look stuck. */
async function messageEventBacklog() {
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
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received — draining...`);
  clearInterval(sweepTimer);
  clearInterval(eventSweepTimer);
  clearInterval(metricsTimer);
  flushMetrics();
  // close() waits for active jobs to finish (bounded by BullMQ's lock duration).
  await Promise.all([worker.close(), eventWorker.close(), digestWorker.close()]);
  await Promise.all([sweepQueue.close(), eventQueue.close(), digestQueue.close()]);
  await redis.quit().catch(() => {});
  // The shared Prisma pool ends itself on SIGTERM/SIGINT (src/lib/prisma.ts).
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Health endpoint (Railway requires an HTTP health check) ─────────────────

const HEALTH_PORT = Number(process.env.PORT ?? 3001) || 3001;

const healthServer = http.createServer(async (_req, res) => {
  try {
    const [counts, eventCounts, eventBacklog, digestCounts] = await Promise.all([
      sweepQueue.getJobCounts("waiting", "active", "failed", "delayed"),
      eventQueue.getJobCounts("waiting", "active", "failed", "delayed"),
      messageEventBacklog().catch(() => null),
      digestQueue.getJobCounts("waiting", "active", "failed", "delayed"),
    ]);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: shuttingDown ? "draining" : "ok",
        service: "push-worker",
        concurrency: CONCURRENCY,
        sendConcurrency: SEND_CONCURRENCY,
        vapidConfigured,
        queue: counts,
        lastJobCompletedAt,
        lastSweep,
        activeSkippedTotal,
        mobilePush: {
          expoAccessToken: Boolean(process.env.EXPO_ACCESS_TOKEN),
          lastSendAt: lastMobileSendAt,
          lastReceiptCheck,
        },
        messageEvents: {
          concurrency: MESSAGE_EVENT_CONCURRENCY,
          queue: eventCounts,
          backlog: eventBacklog,
          lastProcessedAt: lastEventProcessedAt,
          lastSweep: lastEventSweep,
        },
        emailDigests: { queue: digestCounts, outcomes: digestOutcomes },
      }),
    );
  } catch {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "push-worker", lastJobCompletedAt }));
  }
});
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[worker] health endpoint listening on :${HEALTH_PORT}`);
});

console.log(
  `[worker] push worker started (concurrency=${CONCURRENCY}, sendConcurrency=${SEND_CONCURRENCY}, ` +
    `messageEventConcurrency=${MESSAGE_EVENT_CONCURRENCY}, ` +
    `redis=${REDIS_URL.replace(/\/\/.*@/, "//***@")})`,
);
// The pre-rewrite default was PUSH_WORKER_CONCURRENCY=25 with one send per
// job slot. Now every job slot fans out SEND_CONCURRENCY sends, so a stale
// 25 means 500 HTTPS requests in flight per replica. Flag it loudly.
if (CONCURRENCY * SEND_CONCURRENCY > 300) {
  console.warn(
    `[worker] PUSH_WORKER_CONCURRENCY x PUSH_SEND_CONCURRENCY = ${CONCURRENCY * SEND_CONCURRENCY} ` +
      `concurrent sends per replica; the designed budget is 200 (10 x 20). ` +
      `Set PUSH_WORKER_CONCURRENCY=10 in the worker service env (or unset it).`,
  );
}
