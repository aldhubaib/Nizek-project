/**
 * BullMQ push notification worker — runs as a separate Railway service.
 *
 * Start: node --import tsx worker.ts
 *
 * Thin by design: parse the job, load subscriptions, compute badges, then hand
 * everything to src/lib/push/delivery.ts (the only place sends happen). Also
 * sweeps the PushOutbox every 30s so pushes the web app failed to enqueue
 * (Redis blip, crash between commit and enqueue) still go out.
 *
 * Shares Postgres with the Next.js app and Redis with BullMQ, on its own event
 * loop so fan-out never competes with page renders.
 */

import http from "node:http";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import webpush from "web-push";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  parsePushJob,
  PUSH_MAX_FAIL_COUNT,
  PUSH_TTL_SECONDS,
} from "./src/lib/push-core.js";
import {
  applyDeliveryEffects,
  deliverToSubscriptions,
  p95,
  type DeliverableSubscription,
} from "./src/lib/push/delivery.js";
import { sweepOutbox } from "./src/lib/push/outbox-core.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "push-notifications";
/** Jobs processed in parallel. Each job sends to <= 50 recipients' devices. */
const CONCURRENCY = Number(process.env.PUSH_WORKER_CONCURRENCY ?? 10) || 10;
/** HTTPS sends in flight per job. */
const SEND_CONCURRENCY = Number(process.env.PUSH_SEND_CONCURRENCY ?? 20) || 20;
const OUTBOX_SWEEP_INTERVAL_MS =
  Number(process.env.PUSH_OUTBOX_SWEEP_MS ?? 30_000) || 30_000;

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const vapidConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (vapidConfigured) {
  webpush.setVapidDetails("mailto:admin@nizek.com", VAPID_PUBLIC!, VAPID_PRIVATE!);
  console.log("[worker] VAPID configured — push delivery enabled");
} else {
  console.warn("[worker] VAPID keys missing — push delivery DISABLED");
}

// ─── Postgres ────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 5) || 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});
pool.on("error", (err) => console.error("[worker] pg pool error:", err.message));

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
  jobsFailed: 0,
  latencies: [] as number[],
};
let lastJobCompletedAt: number | null = null;

function flushMetrics() {
  if (metrics.jobs === 0 && metrics.jobsFailed === 0) return;
  console.log(
    `[worker] 1m jobs=${metrics.jobs} failedJobs=${metrics.jobsFailed} sends=${metrics.sends} ` +
      `ok=${metrics.ok} gone=${metrics.gone} permanent=${metrics.permanent} ` +
      `transient=${metrics.transient} p95=${p95(metrics.latencies) ?? "-"}ms`,
  );
  metrics.jobs = 0;
  metrics.sends = 0;
  metrics.ok = 0;
  metrics.gone = 0;
  metrics.permanent = 0;
  metrics.transient = 0;
  metrics.jobsFailed = 0;
  metrics.latencies = [];
}
const metricsTimer = setInterval(flushMetrics, 60_000);
metricsTimer.unref();

// ─── Job processor ───────────────────────────────────────────────────────────

async function processPushJob(raw: unknown, jobId: string | undefined): Promise<void> {
  if (!vapidConfigured) return;

  const job = parsePushJob(raw);
  if (!job) {
    console.error(`[worker] job ${jobId} has an unusable payload; dropping`);
    return;
  }
  if (job.recipientIds.length === 0) return;

  const [subscriptions, grouped] = await Promise.all([
    prisma.pushSubscription.findMany({
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
      },
    }),
    prisma.notification.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: job.recipientIds }, read: false },
      _count: { _all: true },
    }),
  ]);
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

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    await processPushJob(job.data, job.id);
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

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received — draining...`);
  clearInterval(sweepTimer);
  clearInterval(metricsTimer);
  flushMetrics();
  // close() waits for active jobs to finish (bounded by BullMQ's lock duration).
  await worker.close();
  await sweepQueue.close();
  await redis.quit().catch(() => {});
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Health endpoint (Railway requires an HTTP health check) ─────────────────

const HEALTH_PORT = Number(process.env.PORT ?? 3001) || 3001;

const healthServer = http.createServer(async (_req, res) => {
  try {
    const counts = await sweepQueue.getJobCounts("waiting", "active", "failed", "delayed");
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
