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

/** Hostname of a push endpoint for grouping in delivery logs (never throws). */
export function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
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
