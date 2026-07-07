import "server-only";
import crypto from "node:crypto";

// Centrifugo is the real-time transport for chat/inbox. This module is
// server-only: it mints the short-lived JWTs browsers use to connect/subscribe
// and publishes events to Centrifugo's HTTP API. It is best-effort — if env
// vars are missing, publishes are no-ops so the app keeps working on its
// polling/refresh fallbacks (messages still persist to Postgres).

const HMAC_SECRET = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY ?? "";
const API_URL = (process.env.CENTRIFUGO_HTTP_API ?? "").replace(/\/$/, "");
const API_KEY = process.env.CENTRIFUGO_API_KEY ?? "";

const CONNECTION_TTL_SECONDS = 60 * 60; // 1h; client refreshes via getToken
const SUBSCRIPTION_TTL_SECONDS = 60 * 60;

export function isCentrifugoConfigured(): boolean {
  return Boolean(HMAC_SECRET && API_URL && API_KEY);
}

// Channel helpers live in a client-safe module and are re-exported for callers
// that already import from here.
export {
  userChannel,
  taskChannel,
  projectChannel,
  conversationChannel,
  globalPresenceChannel,
} from "@/lib/channels";

// ─── JWT (HS256) ──────────────────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac("sha256", HMAC_SECRET).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

/** Connection token: authenticates the WebSocket connection as this member. */
export function connectionToken(memberId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: memberId,
    iat: now,
    exp: now + CONNECTION_TTL_SECONDS,
  });
}

/** Subscription token: authorizes this member to subscribe to one channel. */
export function subscriptionToken(memberId: string, channel: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: memberId,
    channel,
    iat: now,
    exp: now + SUBSCRIPTION_TTL_SECONDS,
  });
}

// ─── Publish ──────────────────────────────────────────────────────────────────

let warnedNotConfigured = false;

async function apiCall(method: string, params: unknown): Promise<void> {
  if (!isCentrifugoConfigured()) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      console.warn(
        "[centrifugo] not configured (CENTRIFUGO_HTTP_API / CENTRIFUGO_API_KEY / CENTRIFUGO_TOKEN_HMAC_SECRET_KEY) — realtime publishes are skipped",
      );
    }
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(params),
      // Never let a realtime broadcast delay or break the originating request.
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[centrifugo] ${method} failed: HTTP ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    // Best-effort: realtime is a delivery optimization, not source of truth.
    console.error(
      `[centrifugo] ${method} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function publish(channel: string, data: unknown): Promise<void> {
  await apiCall("publish", { channel, data });
}

/** Publish the same payload to multiple channels in one round-trip. */
export async function broadcast(
  channels: string[],
  data: unknown,
): Promise<void> {
  const unique = [...new Set(channels)].filter(Boolean);
  if (unique.length === 0) return;
  await apiCall("broadcast", { channels: unique, data });
}
