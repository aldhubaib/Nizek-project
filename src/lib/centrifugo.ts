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

// Channel helpers live in a client-safe module. Import locally (so this module
// can use them) and re-export for callers that already import from here.
import {
  userChannel,
  taskChannel,
  projectChannel,
  conversationChannel,
  globalPresenceChannel,
} from "@/lib/channels";

export {
  userChannel,
  taskChannel,
  projectChannel,
  conversationChannel,
  globalPresenceChannel,
};

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

/**
 * Connection token: authenticates the WebSocket connection as this member.
 * `info` (e.g. `{ deviceId }`) is embedded as the client's connection info so
 * it's returned by presence queries — used to tell which of a user's devices is
 * currently connected (foreground/active) for presence-aware push.
 */
export function connectionToken(
  memberId: string,
  info?: Record<string, unknown>,
): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: memberId,
    iat: now,
    exp: now + CONNECTION_TTL_SECONDS,
    ...(info ? { info } : {}),
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

// Server->Centrifugo publishes reuse TCP connections via a keep-alive dispatcher
// so bursts of events don't each pay a fresh TCP+TLS handshake. We lazily install
// an undici Agent as the global dispatcher when available; undici (Node's fetch)
// also pools with keep-alive by default, so this is a best-effort tightening.
let dispatcherReady = false;
async function ensureKeepAliveDispatcher(): Promise<void> {
  if (dispatcherReady) return;
  dispatcherReady = true;
  try {
    // Non-literal specifier so bundlers/TS don't hard-require undici at build.
    const moduleName = "undici";
    const undici: {
      setGlobalDispatcher: (d: unknown) => void;
      Agent: new (opts: Record<string, number>) => unknown;
    } = await import(/* webpackIgnore: true */ moduleName);
    undici.setGlobalDispatcher(
      new undici.Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000, connections: 64 }),
    );
  } catch {
    // undici not importable directly — global fetch still pools by default.
  }
}

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
  await ensureKeepAliveDispatcher();
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

/** Same as publish/broadcast but never written to channel history (typing). */
export async function broadcastEphemeral(
  channels: string[],
  data: unknown,
): Promise<void> {
  const unique = [...new Set(channels)].filter(Boolean);
  if (unique.length === 0) return;
  if (unique.length === 1) {
    await apiCall("publish", {
      channel: unique[0],
      data,
      skip_history: true,
    });
    return;
  }
  await apiCall("batch", {
    commands: unique.map((channel) => ({
      publish: { channel, data, skip_history: true },
    })),
  });
}

// ─── Kanban board events (consolidated from Pusher) ────────────────────────────
// Board task events ride the project channel alongside chat; subscribers filter by
// the `task-*` discriminator so chat and board payloads never cross-fire.

export type TaskEvent =
  | { type: "task-moved"; taskId: string; stage: string; order: number; userId: string }
  | { type: "task-created"; taskId: string; userId: string }
  | { type: "task-updated"; taskId: string; userId: string }
  | { type: "task-deleted"; taskId: string; userId: string }
  | { type: "task-declined"; taskId: string; userId: string };

export async function broadcastTaskEvent(
  projectId: string,
  event: TaskEvent,
): Promise<void> {
  await publish(projectChannel(projectId), event);
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

/**
 * Send multiple distinct publish commands in a single HTTP round-trip via
 * Centrifugo's batch API. Each item has its own channel + data, unlike
 * `broadcast` which sends the same data to multiple channels.
 */
export async function batchPublish(
  items: Array<{ channel: string; data: unknown }>,
): Promise<void> {
  if (items.length === 0) return;
  if (items.length === 1) {
    await publish(items[0].channel, items[0].data);
    return;
  }
  await apiCall("batch", {
    commands: items.map((item) => ({
      publish: { channel: item.channel, data: item.data },
    })),
  });
}

// ─── Presence ──────────────────────────────────────────────────────────────────

type PresenceResponse = {
  result?: {
    presence?: Record<
      string,
      { user?: string; conn_info?: { deviceId?: string } }
    >;
  };
};

/**
 * Returns the set of device IDs currently connected on a channel (from each
 * client's connection info). Best-effort: returns an empty set if Centrifugo is
 * unavailable so callers fall back to their default behavior (e.g. send push).
 */
export async function getPresenceDeviceIds(
  channel: string,
): Promise<Set<string>> {
  const devices = new Set<string>();
  if (!isCentrifugoConfigured()) return devices;
  await ensureKeepAliveDispatcher();
  try {
    const res = await fetch(`${API_URL}/api/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify({ channel }),
      cache: "no-store",
    });
    if (!res.ok) return devices;
    const data = (await res.json()) as PresenceResponse;
    const clients = data.result?.presence ?? {};
    for (const client of Object.values(clients)) {
      const deviceId = client.conn_info?.deviceId;
      if (deviceId) devices.add(deviceId);
    }
  } catch {
    // Best-effort: on any failure we simply don't suppress push.
  }
  return devices;
}

/** True if the user has at least one connected client on their user channel. */
export async function isUserOnline(memberId: string): Promise<boolean> {
  if (!isCentrifugoConfigured()) return false;
  await ensureKeepAliveDispatcher();
  try {
    const res = await fetch(`${API_URL}/api/presence_stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify({ channel: userChannel(memberId) }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      result?: { num_clients?: number };
    };
    return (data.result?.num_clients ?? 0) > 0;
  } catch {
    return false;
  }
}
