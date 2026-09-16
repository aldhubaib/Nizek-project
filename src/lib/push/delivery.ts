// The ONE place web-push sends happen. Runs inside the worker process (and the
// load test). No Next.js imports, no path aliases, no "server-only": the worker
// image copies this file and runs it with tsx.
//
// Two phases so the send loop is pure and testable:
//   1. deliverToSubscriptions(): sends with bounded concurrency and returns
//      the EFFECTS (logs, rows to delete, failCount changes) without touching
//      the database.
//   2. applyDeliveryEffects(): writes those effects in a handful of batched
//      statements.

import {
  buildPushBody,
  classifyOutcome,
  endpointHost,
  mapWithConcurrency,
  PUSH_MAX_FAIL_COUNT,
  sendWithRetry,
  type DeliveryOutcomeKind,
  type PushPayload,
} from "../push-core";

export interface DeliverableSubscription {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failCount: number;
}

/** Sends one push. Must reject with `{ statusCode }` on HTTP failure (web-push does). */
export type SendFn = (
  sub: DeliverableSubscription,
  body: string,
) => Promise<void>;

export interface DeliveryLogEntry {
  recipientId: string;
  subscriptionId: string;
  endpointHost: string | null;
  type: string | null;
  tag: string | null;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  latencyMs: number;
}

export interface DeliveryEffects {
  logs: DeliveryLogEntry[];
  /** Endpoint gone (404/410): delete immediately. */
  goneIds: string[];
  /** Permanent failure: increment failCount; delete when it reaches the max. */
  permanentFailures: { id: string; statusCode: number | null; failCount: number }[];
  /** Delivered: reset failCount, stamp lastSuccessAt. */
  successIds: string[];
  counts: Record<DeliveryOutcomeKind, number>;
  latencies: number[];
}

export const DEFAULT_SEND_CONCURRENCY = 20;

export async function deliverToSubscriptions(input: {
  subscriptions: DeliverableSubscription[];
  payload: PushPayload;
  badgeByRecipient: Map<string, number>;
  fallbackUrl: string;
  send: SendFn;
  concurrency?: number;
  /** Test hook: shortens retry backoff. */
  retryBackoffMs?: number;
}): Promise<DeliveryEffects> {
  const effects: DeliveryEffects = {
    logs: [],
    goneIds: [],
    permanentFailures: [],
    successIds: [],
    counts: { ok: 0, gone: 0, permanent: 0, transient: 0 },
    latencies: [],
  };

  await mapWithConcurrency(
    input.subscriptions,
    input.concurrency ?? DEFAULT_SEND_CONCURRENCY,
    async (sub) => {
      const body = buildPushBody(input.payload, {
        badge: input.badgeByRecipient.get(sub.memberId) ?? 0,
        fallbackUrl: input.fallbackUrl,
      });

      const startedAt = Date.now();
      const outcome = await sendWithRetry(
        () => input.send(sub, body),
        input.retryBackoffMs === undefined ? {} : { backoffMs: input.retryBackoffMs },
      );
      const latencyMs = Date.now() - startedAt;
      const kind = classifyOutcome(outcome.ok, outcome.statusCode);

      effects.counts[kind] += 1;
      effects.latencies.push(latencyMs);
      effects.logs.push({
        recipientId: sub.memberId,
        subscriptionId: sub.id,
        endpointHost: endpointHost(sub.endpoint),
        type: input.payload.type ?? null,
        tag: input.payload.tag ?? null,
        ok: outcome.ok,
        statusCode: outcome.statusCode ?? null,
        error: outcome.error?.slice(0, 500) ?? null,
        latencyMs,
      });

      if (kind === "ok") effects.successIds.push(sub.id);
      else if (kind === "gone") effects.goneIds.push(sub.id);
      else if (kind === "permanent") {
        effects.permanentFailures.push({
          id: sub.id,
          statusCode: outcome.statusCode ?? null,
          failCount: sub.failCount + 1,
        });
      }
    },
  );

  return effects;
}

/** The subset of Prisma the effects writer needs (lets tests pass a fake). */
export interface DeliveryDb {
  pushDeliveryLog: {
    createMany(args: { data: DeliveryLogEntry[] }): Promise<unknown>;
  };
  pushSubscription: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<unknown>;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: {
        failCount?: number | { increment: number };
        lastSuccessAt?: Date;
        lastFailureAt?: Date;
        lastFailureStatus?: number | null;
      };
    }): Promise<unknown>;
  };
}

/** Ids whose failCount has reached the retirement threshold. */
export function retiredIds(effects: DeliveryEffects): string[] {
  return effects.permanentFailures
    .filter((f) => f.failCount >= PUSH_MAX_FAIL_COUNT)
    .map((f) => f.id);
}

export async function applyDeliveryEffects(
  db: DeliveryDb,
  effects: DeliveryEffects,
  now: Date = new Date(),
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (effects.logs.length > 0) {
    tasks.push(
      db.pushDeliveryLog.createMany({ data: effects.logs }).catch((err: unknown) =>
        console.error(
          "[push] delivery log insert failed:",
          err instanceof Error ? err.message : err,
        ),
      ),
    );
  }

  if (effects.successIds.length > 0) {
    tasks.push(
      db.pushSubscription
        .updateMany({
          where: { id: { in: effects.successIds } },
          data: { failCount: 0, lastSuccessAt: now },
        })
        .catch(() => {}),
    );
  }

  // Permanent failures: one UPDATE per distinct status so lastFailureStatus is
  // accurate, then retire anything that has now hit the threshold.
  const byStatus = new Map<number | null, string[]>();
  for (const f of effects.permanentFailures) {
    const list = byStatus.get(f.statusCode) ?? [];
    list.push(f.id);
    byStatus.set(f.statusCode, list);
  }
  for (const [statusCode, ids] of byStatus) {
    tasks.push(
      db.pushSubscription
        .updateMany({
          where: { id: { in: ids } },
          data: {
            failCount: { increment: 1 },
            lastFailureAt: now,
            lastFailureStatus: statusCode,
          },
        })
        .catch(() => {}),
    );
  }

  const toDelete = [...effects.goneIds, ...retiredIds(effects)];
  if (toDelete.length > 0) {
    // Runs after the updates so the retire check sees the incremented count in
    // the same tick of effects; ids are decided from `effects`, not re-read.
    tasks.push(
      Promise.all(tasks.slice())
        .then(() =>
          db.pushSubscription.deleteMany({ where: { id: { in: toDelete } } }),
        )
        .catch(() => {}),
    );
  }

  await Promise.all(tasks);
}

/** p95 of the recorded latencies (ms), or null when nothing was sent. */
export function p95(latencies: number[]): number | null {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}
