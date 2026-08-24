/**
 * BullMQ push notification worker — runs as a separate Railway service.
 *
 * Start: node --import tsx worker.ts
 * Build: npx tsx worker.ts (or compile with tsconfig.worker.json)
 *
 * This process shares the same Redis as Centrifugo and the same Postgres as
 * the Next.js app but runs on its own event loop, so push fan-out never
 * competes with page renders.
 */

import http from "node:http";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import webpush from "web-push";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  buildPushBody,
  endpointHost,
  isGoneStatus,
  sendWithRetry,
  PUSH_TTL_SECONDS,
  type PushPayload,
} from "./src/lib/push-core.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL =
  process.env.REDIS_URL || process.env.CENTRIFUGO_REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "push-notifications";
const CONCURRENCY = Number(process.env.PUSH_WORKER_CONCURRENCY ?? 10) || 10;

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

// ─── Postgres (shared pool for the worker lifetime) ──────────────────────────

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

// ─── Job types ───────────────────────────────────────────────────────────────

type PushJobData = {
  recipientIds: string[];
  payload: PushPayload;
};

// ─── Job processor ───────────────────────────────────────────────────────────

async function processPushJob(data: PushJobData): Promise<void> {
  if (!vapidConfigured) return;

  const { recipientIds, payload } = data;
  if (recipientIds.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { memberId: { in: recipientIds } },
  });
  if (subscriptions.length === 0) return;

  // Batch: one query for all recipients' unread counts.
  const grouped = await prisma.notification.groupBy({
    by: ["recipientId"],
    where: { recipientId: { in: recipientIds }, read: false },
    _count: { _all: true },
  });
  const unreadByRecipient = new Map(
    grouped.map((g) => [g.recipientId, g._count._all]),
  );

  // Fan out to all devices, collect results for batch logging.
  const logEntries: Array<{
    recipientId: string;
    subscriptionId: string;
    endpointHost: string | null;
    type: string | null;
    tag: string | null;
    ok: boolean;
    statusCode: number | null;
    error: string | null;
    latencyMs: number;
  }> = [];
  const staleSubIds: string[] = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const body = buildPushBody(payload, {
        badge: unreadByRecipient.get(sub.memberId) ?? 0,
        fallbackUrl: APP_URL || "/dashboard",
      });

      const startedAt = Date.now();
      const outcome = await sendWithRetry(() =>
        webpush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: PUSH_TTL_SECONDS, urgency: "high" },
          )
          .then(() => undefined),
      );
      const latencyMs = Date.now() - startedAt;

      if (!outcome.ok && isGoneStatus(outcome.statusCode)) {
        staleSubIds.push(sub.id);
      }

      logEntries.push({
        recipientId: sub.memberId,
        subscriptionId: sub.id,
        endpointHost: endpointHost(sub.endpoint),
        type: payload.type ?? null,
        tag: payload.tag ?? null,
        ok: outcome.ok,
        statusCode: outcome.statusCode ?? null,
        error: outcome.error?.slice(0, 500) ?? null,
        latencyMs,
      });

      return outcome;
    }),
  );

  // Batch insert all delivery logs in one query.
  if (logEntries.length > 0) {
    await prisma.pushDeliveryLog
      .createMany({ data: logEntries })
      .catch((err) =>
        console.error("[worker] delivery log batch insert failed:", err.message),
      );
  }

  // Clean up stale subscriptions (endpoint gone / unsubscribed).
  if (staleSubIds.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: staleSubIds } } })
      .catch(() => {});
  }

  const failed = results.filter(
    (r) => r.status === "fulfilled" && !r.value.ok,
  ).length;
  if (failed > 0) {
    console.error(
      `[worker] ${failed}/${subscriptions.length} sends failed (tag=${payload.tag ?? "-"})`,
    );
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    await processPushJob(job.data as PushJobData);
  },
  {
    connection: redis,
    concurrency: CONCURRENCY,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
);

worker.on("completed", (job) => {
  if (process.env.PUSH_WORKER_VERBOSE) {
    console.log(`[worker] job ${job.id} completed`);
  }
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] error:", err.message);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received — shutting down...`);
  await worker.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Health endpoint (Railway requires an HTTP health check) ─────────────────

const HEALTH_PORT = Number(process.env.PORT ?? 3001) || 3001;
const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "push-worker" }));
});
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[worker] health endpoint listening on :${HEALTH_PORT}`);
});

console.log(
  `[worker] push notification worker started (concurrency=${CONCURRENCY}, redis=${REDIS_URL.replace(/\/\/.*@/, "//***@")})`,
);
