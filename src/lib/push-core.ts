// Pure web-push helpers, separated from I/O (prisma/web-push) so the delivery
// policy is unit testable.

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /** Notification icon: sender avatar or project thumbnail. */
  icon?: string;
  /** Notification type ("message" | "mention" | ...) for delivery logging. */
  type?: string;
}

/** How long the push service should retain an undelivered push (seconds). */
export const PUSH_TTL_SECONDS = 60 * 60 * 24; // 24h — matches chat relevance

/** Serialized notification body handed to the service worker. */
export function buildPushBody(
  payload: PushPayload,
  opts: { badge: number; fallbackUrl: string },
): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body || "",
    url: payload.url || opts.fallbackUrl || "/dashboard",
    badge: opts.badge,
    tag: payload.tag,
    icon: payload.icon,
  });
}

/**
 * Transient failures worth one retry: rate limiting and push-service errors.
 * Permanent failures (401/403 bad VAPID, 400 malformed, 404/410 gone) are not.
 */
export function isRetryableStatus(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return true; // network error — retry once
  if (statusCode === 429) return true;
  return statusCode >= 500 && statusCode < 600;
}

/** Endpoint statuses meaning the subscription no longer exists. */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Statuses that will keep failing for this subscription no matter how often
 * we retry: malformed subscription (400), VAPID mismatch/expired key (401/403),
 * oversized payload (413). Unlike "gone" they don't prove the device is dead
 * (a key rotation is fixable client-side), so the row is retired only after
 * PUSH_MAX_FAIL_COUNT consecutive permanent failures.
 */
export function isPermanentStatus(statusCode: number | undefined): boolean {
  return (
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 413
  );
}

/** Consecutive permanent failures after which a subscription row is deleted. */
export const PUSH_MAX_FAIL_COUNT = 5;

export type DeliveryOutcomeKind = "ok" | "gone" | "permanent" | "transient";

/** Collapses a send result into the action the worker must take. */
export function classifyOutcome(
  ok: boolean,
  statusCode: number | undefined,
): DeliveryOutcomeKind {
  if (ok) return "ok";
  if (isGoneStatus(statusCode)) return "gone";
  if (isPermanentStatus(statusCode)) return "permanent";
  return "transient";
}

// ─── Job shape ──────────────────────────────────────────────────────────────

/** Recipients per queue job. Bounds the fan-out (and the DB query) per job. */
export const PUSH_JOB_CHUNK_SIZE = 50;

/** Original job shape (still accepted for one release during rollout). */
export type PushJobV1 = { recipientIds: string[]; payload: PushPayload };

/** Outbox-backed job: identified by batch + chunk so re-dispatch is idempotent. */
export type PushJobV2 = {
  v: 2;
  batchId: string;
  chunk: number;
  recipientIds: string[];
  payload: PushPayload;
};

export type ParsedPushJob = {
  batchId: string | null;
  chunk: number;
  recipientIds: string[];
  payload: PushPayload;
};

/** Accepts both job shapes; returns null for anything unusable. */
export function parsePushJob(data: unknown): ParsedPushJob | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<PushJobV2> & Partial<PushJobV1>;
  if (!Array.isArray(d.recipientIds) || !d.payload || typeof d.payload !== "object") {
    return null;
  }
  const recipientIds = d.recipientIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (typeof d.payload.title !== "string") return null;
  const isV2 = d.v === 2 && typeof d.batchId === "string";
  return {
    batchId: isV2 ? d.batchId! : null,
    chunk: isV2 && typeof d.chunk === "number" ? d.chunk : 0,
    recipientIds,
    payload: d.payload,
  };
}

export function chunkRecipients(
  ids: string[],
  size: number = PUSH_JOB_CHUNK_SIZE,
): string[][] {
  const unique = [...new Set(ids)].filter(Boolean);
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    out.push(unique.slice(i, i + size));
  }
  return out;
}

/**
 * Deterministic BullMQ job id. Enqueuing the same id twice is a no-op, which is
 * what makes outbox re-dispatch safe. Uses "-" because ":" is BullMQ's key
 * separator.
 */
export function pushJobId(batchId: string, chunk: number): string {
  return `${batchId}-${chunk}`;
}

/** Splits an outbox row into the queue jobs it should produce. */
export function buildPushJobs(
  batchId: string,
  recipientIds: string[],
  payload: PushPayload,
): { jobId: string; data: PushJobV2 }[] {
  return chunkRecipients(recipientIds).map((ids, chunk) => ({
    jobId: pushJobId(batchId, chunk),
    data: { v: 2, batchId, chunk, recipientIds: ids, payload },
  }));
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. Replaces the unbounded
 * Promise.allSettled fan-out that opened one HTTPS request per device at once.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** Hostname of a push endpoint for grouping in delivery logs (never throws). */
export function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

/**
 * A queued job left unprocessed for longer than this means the worker process
 * isn't consuming the queue, not that it is merely busy.
 */
const QUEUE_STALL_MS = 5 * 60 * 1000;

/** A backlog this deep is worth flagging even while the worker is draining it. */
const QUEUE_BACKLOG_WARN = 25;

export type PushQueueState = "ok" | "warn" | "fail";

export interface PushQueueAssessment {
  state: PushQueueState;
  label: string;
  detail?: string;
}

/**
 * Turn queue counters into a verdict on push delivery. Every real notification
 * is enqueued rather than sent inline, so a stalled queue silently drops every
 * notification while all the per-device checks still pass.
 */
export function assessPushQueue(input: {
  reachable: boolean;
  waiting: number;
  active: number;
  lastCompletedAt: Date | null;
  now?: Date;
}): PushQueueAssessment {
  if (!input.reachable) {
    return {
      state: "fail",
      label: "Delivery service unreachable",
      detail:
        "The notification queue can't be reached, so no notifications are being sent. Contact an admin.",
    };
  }

  const now = input.now ?? new Date();
  const pending = input.waiting + input.active;
  const sinceCompleted = input.lastCompletedAt
    ? now.getTime() - input.lastCompletedAt.getTime()
    : null;
  const stalled =
    pending > 0 && (sinceCompleted === null || sinceCompleted > QUEUE_STALL_MS);

  if (stalled) {
    return {
      state: "fail",
      label: "Delivery service not running",
      detail: `${pending} notification${pending === 1 ? "" : "s"} queued but nothing has been delivered recently — the push worker is likely down. Contact an admin.`,
    };
  }

  if (input.waiting >= QUEUE_BACKLOG_WARN) {
    return {
      state: "warn",
      label: "Delivery service is behind",
      detail: `${input.waiting} notifications are waiting to be sent, so banners may arrive late.`,
    };
  }

  return { state: "ok", label: "Delivery service running" };
}

const MAX_ATTEMPTS = 3;
const BACKOFF_SCHEDULE = [500, 2000];

/**
 * Runs `send` with up to 2 retries (3 total attempts) using exponential
 * backoff (500ms, 2s) when the failure is transient. Returns the final
 * outcome; never throws.
 */
export async function sendWithRetry(
  send: () => Promise<void>,
  opts: { backoffMs?: number } = {},
): Promise<{ ok: boolean; statusCode?: number; error?: string; attempts: number }> {
  const attempt = async (): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
  }> => {
    try {
      await send();
      return { ok: true };
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      return { ok: false, statusCode, error: message };
    }
  };

  let result = await attempt();
  let attempts = 1;

  while (!result.ok && isRetryableStatus(result.statusCode) && attempts < MAX_ATTEMPTS) {
    const delay = opts.backoffMs ?? BACKOFF_SCHEDULE[attempts - 1] ?? 2000;
    await new Promise((r) => setTimeout(r, delay));
    result = await attempt();
    attempts++;
  }

  return { ...result, attempts };
}
