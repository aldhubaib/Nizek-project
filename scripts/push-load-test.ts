/**
 * Push delivery load test — proves one worker replica sustains the design
 * burst (100 sends/s) and that delivery effects (prune on 410, failCount on
 * 403, retirement at 5) are applied correctly, with NO external services.
 *
 *   npx tsx scripts/push-load-test.ts                # 10k sends, 5% 410, 2% 500, 1% 403
 *   npx tsx scripts/push-load-test.ts --sends 20000 --target 150
 *   npx tsx scripts/push-load-test.ts --gone 10 --error 5 --perm 2
 *
 * What runs for real:
 *   - src/lib/push/delivery.ts (the only sender), with the worker's exact
 *     concurrency shape: PUSH_WORKER_CONCURRENCY jobs x PUSH_SEND_CONCURRENCY sends.
 *   - web-push payload encryption + VAPID signing via generateRequestDetails()
 *     for every send (the CPU cost that actually bounds throughput).
 *   - src/lib/push-core.ts chunking (50 recipients/job) and retry policy.
 *
 * What is faked:
 *   - The push service: a local HTTP server. Outcome per subscription is
 *     deterministic (by index) so assertions are exact:
 *       gone  -> 410 always            (row must be deleted)
 *       error -> 500 on the FIRST try  (retry must succeed => counted ok)
 *       perm  -> 403 always            (failCount must increment; delete at 5)
 *   - Postgres: an in-memory DeliveryDb that applies the same statements.
 *   - Transport is plain HTTP (web-push hardcodes https; we reuse its request
 *     details over node:http). TLS handshakes are amortised by keep-alive in
 *     production, so this does not change the steady-state number.
 *
 * Exit code 1 when throughput is below --target or any effect is wrong.
 */

import http from "node:http";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import webpush from "web-push";
import {
  buildPushJobs,
  PUSH_MAX_FAIL_COUNT,
  mapWithConcurrency,
  type PushPayload,
} from "../src/lib/push-core.js";
import {
  applyDeliveryEffects,
  deliverToSubscriptions,
  p95,
  type DeliverableSubscription,
  type DeliveryDb,
  type DeliveryEffects,
  type DeliveryLogEntry,
} from "../src/lib/push/delivery.js";

// ─── CLI ─────────────────────────────────────────────────────────────────────

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const SENDS = arg("sends", 10_000);
const TARGET_PER_S = arg("target", 100);
const GONE_PCT = arg("gone", 5);
const ERROR_PCT = arg("error", 2);
const PERM_PCT = arg("perm", 1);
const JOB_CONCURRENCY = Number(process.env.PUSH_WORKER_CONCURRENCY ?? 10) || 10;
const SEND_CONCURRENCY = Number(process.env.PUSH_SEND_CONCURRENCY ?? 20) || 20;

type Fate = "ok" | "gone" | "error" | "perm";
function fateOf(index: number): Fate {
  const bucket = index % 100;
  if (bucket < GONE_PCT) return "gone";
  if (bucket < GONE_PCT + ERROR_PCT) return "error";
  if (bucket < GONE_PCT + ERROR_PCT + PERM_PCT) return "perm";
  return "ok";
}

// ─── Mock push service ───────────────────────────────────────────────────────

const attemptsByPath = new Map<string, number>();

function startMockPushService(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    // Drain the body (encrypted payload) like a real push service would.
    req.on("data", () => {});
    req.on("end", () => {
      const path = req.url ?? "/";
      const index = Number(path.split("/").pop());
      const fate = fateOf(index);
      const attempt = (attemptsByPath.get(path) ?? 0) + 1;
      attemptsByPath.set(path, attempt);

      if (fate === "gone") return void res.writeHead(410).end();
      if (fate === "perm") return void res.writeHead(403).end();
      if (fate === "error" && attempt === 1) return void res.writeHead(500).end();
      res.writeHead(201).end();
    });
  });
  server.keepAliveTimeout = 30_000;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}

// ─── Fake Postgres (DeliveryDb) ──────────────────────────────────────────────

interface Row extends DeliverableSubscription {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureStatus: number | null;
}

class MemoryDb implements DeliveryDb {
  rows = new Map<string, Row>();
  logs: DeliveryLogEntry[] = [];

  pushDeliveryLog = {
    createMany: async (args: { data: DeliveryLogEntry[] }) => {
      this.logs.push(...args.data);
    },
  };

  pushSubscription = {
    deleteMany: async (args: { where: { id: { in: string[] } } }) => {
      for (const id of args.where.id.in) this.rows.delete(id);
    },
    updateMany: async (args: {
      where: { id: { in: string[] } };
      data: {
        failCount?: number | { increment: number };
        lastSuccessAt?: Date;
        lastFailureAt?: Date;
        lastFailureStatus?: number | null;
      };
    }) => {
      for (const id of args.where.id.in) {
        const row = this.rows.get(id);
        if (!row) continue;
        const fc = args.data.failCount;
        if (typeof fc === "number") row.failCount = fc;
        else if (fc) row.failCount += fc.increment;
        if (args.data.lastSuccessAt) row.lastSuccessAt = args.data.lastSuccessAt;
        if (args.data.lastFailureAt) row.lastFailureAt = args.data.lastFailureAt;
        if (args.data.lastFailureStatus !== undefined)
          row.lastFailureStatus = args.data.lastFailureStatus;
      }
    },
  };
}

// ─── Synthetic subscriptions ─────────────────────────────────────────────────

/** One real P-256 key pair shared by every fake device; encryption cost is identical. */
function fakeClientKeys(): { p256dh: string; auth: string } {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  // Uncompressed point is the trailing 65 bytes of the SPKI DER.
  const raw = spki.subarray(spki.length - 65);
  return {
    p256dh: raw.toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

function seed(db: MemoryDb, count: number, port: number): string[] {
  const keys = fakeClientKeys();
  const recipientIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const memberId = `m_${i}`;
    recipientIds.push(memberId);
    db.rows.set(`s_${i}`, {
      id: `s_${i}`,
      memberId,
      endpoint: `http://127.0.0.1:${port}/push/${i}`,
      p256dh: keys.p256dh,
      auth: keys.auth,
      failCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureStatus: null,
    });
  }
  return recipientIds;
}

// ─── Sender: real web-push encryption + VAPID over node:http ─────────────────

const agent = new http.Agent({ keepAlive: true, maxSockets: JOB_CONCURRENCY * SEND_CONCURRENCY });

function sendOverHttp(sub: DeliverableSubscription, body: string): Promise<void> {
  const details = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    body,
    { TTL: 60, urgency: "high" },
  );
  return new Promise((resolve, reject) => {
    const req = http.request(
      details.endpoint,
      { method: details.method, headers: details.headers, agent },
      (res) => {
        res.resume();
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve();
          else reject(Object.assign(new Error(`Received unexpected response code ${status}`), { statusCode: status }));
        });
      },
    );
    req.on("error", reject);
    req.end(details.body);
  });
}

// ─── One worker replica ──────────────────────────────────────────────────────

const PAYLOAD: PushPayload = {
  title: "Load test",
  body: "Synthetic push",
  url: "/dashboard",
  tag: "load-test",
  type: "system",
};

async function runWorkerReplica(db: MemoryDb, recipientIds: string[], retryBackoffMs?: number) {
  const jobs = buildPushJobs("load", recipientIds, PAYLOAD);
  const totals: DeliveryEffects["counts"] = { ok: 0, gone: 0, permanent: 0, transient: 0 };
  const latencies: number[] = [];
  let sends = 0;

  await mapWithConcurrency(jobs, JOB_CONCURRENCY, async (job) => {
    const wanted = new Set(job.data.recipientIds);
    const subscriptions = [...db.rows.values()].filter(
      (r) => wanted.has(r.memberId) && r.failCount < PUSH_MAX_FAIL_COUNT,
    );
    if (subscriptions.length === 0) return;
    const effects = await deliverToSubscriptions({
      subscriptions,
      payload: job.data.payload,
      badgeByRecipient: new Map(),
      fallbackUrl: "/dashboard",
      concurrency: SEND_CONCURRENCY,
      send: sendOverHttp,
      retryBackoffMs,
    });
    await applyDeliveryEffects(db, effects);
    sends += subscriptions.length;
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += effects.counts[k];
    latencies.push(...effects.latencies);
  });

  return { jobs: jobs.length, sends, totals, latencies };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const vapid = webpush.generateVAPIDKeys();
  webpush.setVapidDetails("mailto:loadtest@nizek.com", vapid.publicKey, vapid.privateKey);

  const service = await startMockPushService();
  const db = new MemoryDb();
  const recipientIds = seed(db, SENDS, service.port);

  const expected = { gone: 0, error: 0, perm: 0, ok: 0 };
  for (let i = 0; i < SENDS; i++) expected[fateOf(i)] += 1;

  console.log(
    `[load] ${SENDS} sends, ${Math.ceil(SENDS / 50)} jobs, ` +
      `concurrency ${JOB_CONCURRENCY} jobs x ${SEND_CONCURRENCY} sends, ` +
      `fates: ${expected.gone} gone(410) / ${expected.error} 500-then-ok / ${expected.perm} 403 / ${expected.ok} ok`,
  );

  const failures: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  // Phase 1: the burst.
  const started = performance.now();
  const r = await runWorkerReplica(db, recipientIds);
  const seconds = (performance.now() - started) / 1000;
  const perSecond = r.sends / seconds;

  console.log(
    `[load] ${r.sends} sends in ${seconds.toFixed(2)}s = ${perSecond.toFixed(0)} sends/s ` +
      `(ok=${r.totals.ok} gone=${r.totals.gone} permanent=${r.totals.permanent} transient=${r.totals.transient}, ` +
      `p95=${p95(r.latencies)}ms, logs=${db.logs.length})`,
  );

  check(perSecond >= TARGET_PER_S, `throughput ${perSecond.toFixed(0)}/s below target ${TARGET_PER_S}/s`);
  check(r.sends === SENDS, `sent ${r.sends}, expected ${SENDS}`);
  check(r.totals.ok === expected.ok + expected.error, `ok=${r.totals.ok}, expected ${expected.ok + expected.error} (500s must succeed on retry)`);
  check(r.totals.gone === expected.gone, `gone=${r.totals.gone}, expected ${expected.gone}`);
  check(r.totals.permanent === expected.perm, `permanent=${r.totals.permanent}, expected ${expected.perm}`);
  check(r.totals.transient === 0, `transient=${r.totals.transient}, expected 0`);
  check(db.logs.length === SENDS, `delivery logs=${db.logs.length}, expected ${SENDS}`);

  // Effects: gone rows deleted, perm rows failCount=1 with status, ok rows stamped.
  let goneLeft = 0, permBad = 0, okBad = 0;
  for (let i = 0; i < SENDS; i++) {
    const row = db.rows.get(`s_${i}`);
    const fate = fateOf(i);
    if (fate === "gone") { if (row) goneLeft++; continue; }
    if (!row) {
      if (fate === "perm") permBad++;
      else okBad++;
      continue;
    }
    if (fate === "perm") {
      if (row.failCount !== 1 || row.lastFailureStatus !== 403 || !row.lastFailureAt) permBad++;
    } else if (row.failCount !== 0 || !row.lastSuccessAt) okBad++;
  }
  check(goneLeft === 0, `${goneLeft} 410 rows were not pruned`);
  check(permBad === 0, `${permBad} 403 rows do not have failCount=1/lastFailureStatus=403`);
  check(okBad === 0, `${okBad} delivered rows are missing failCount=0/lastSuccessAt`);

  // Phase 2: retirement. Hit the 403 devices PUSH_MAX_FAIL_COUNT-1 more times;
  // they must be deleted exactly when failCount reaches the threshold.
  const permIds = recipientIds.filter((_, i) => fateOf(i) === "perm");
  if (permIds.length > 0) {
    for (let round = 2; round <= PUSH_MAX_FAIL_COUNT; round++) {
      await runWorkerReplica(db, permIds, 1);
      const sample = db.rows.get(`s_${recipientIds.indexOf(permIds[0])}`);
      if (round < PUSH_MAX_FAIL_COUNT) {
        check(sample?.failCount === round, `after round ${round} failCount=${sample?.failCount}, expected ${round}`);
      }
    }
    const survivors = permIds.filter((m) => [...db.rows.values()].some((r) => r.memberId === m));
    check(survivors.length === 0, `${survivors.length} 403 rows survived ${PUSH_MAX_FAIL_COUNT} failures (should be retired)`);
    // A retired device gets no further sends.
    const after = await runWorkerReplica(db, permIds, 1);
    check(after.sends === 0, `retired rows still received ${after.sends} sends`);
    console.log(`[load] retirement: ${permIds.length} devices with 403 deleted after ${PUSH_MAX_FAIL_COUNT} failures, 0 sends afterwards`);
  }

  await service.close();
  agent.destroy();

  if (failures.length > 0) {
    console.error("\n[load] FAILED");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`\n[load] PASS — ${perSecond.toFixed(0)} sends/s on one replica (target ${TARGET_PER_S}/s), effects correct`);
}

main().catch((err) => {
  console.error("[load] crashed:", err);
  process.exit(1);
});
