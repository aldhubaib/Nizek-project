// Expo push delivery for the native mobile app. Mirrors delivery.ts (web
// push): phase 1 sends and returns EFFECTS, phase 2 writes them. Runs in the
// worker only. No Next imports, no path aliases, no "server-only".

import { PUSH_MAX_FAIL_COUNT, type PushPayload } from "../push-core";
import {
  EXPO_PUSH_CHUNK_SIZE,
  EXPO_RECEIPT_CHUNK_SIZE,
  buildBadgeMessage,
  buildExpoMessage,
  chunk,
  classifyExpoResult,
  type ExpoMessage,
  type ExpoOutcome,
  type ExpoResult,
  type MobileTokenRow,
} from "../mobile-push-core";

/** Sends one chunk (≤100). Resolves to one result per message, in order. */
export type ExpoSendFn = (messages: ExpoMessage[]) => Promise<ExpoResult[]>;
/** Fetches receipts for ≤300 ids. Missing ids are simply absent. */
export type ExpoReceiptsFn = (ids: string[]) => Promise<Record<string, ExpoResult>>;

export interface PendingReceipt {
  receiptId: string;
  tokenId: string;
  memberId: string;
}

export interface ExpoDeliveryEffects {
  logs: {
    recipientId: string;
    subscriptionId: string;
    endpointHost: string;
    type: string | null;
    tag: string | null;
    ok: boolean;
    statusCode: number | null;
    error: string | null;
    latencyMs: number;
  }[];
  goneIds: string[];
  permanentFailures: { id: string; error: string; failCount: number }[];
  successIds: string[];
  /** Tickets to check later; Expo reports APNs/FCM rejections there. */
  receipts: PendingReceipt[];
  counts: Record<ExpoOutcome, number>;
}

const EXPO_HOST = "exp.host";
const MAX_CHUNK_ATTEMPTS = 3;
const BACKOFF_MS = [500, 2000];

function emptyEffects(): ExpoDeliveryEffects {
  return {
    logs: [],
    goneIds: [],
    permanentFailures: [],
    successIds: [],
    receipts: [],
    counts: { ok: 0, gone: 0, permanent: 0, transient: 0 },
  };
}

/**
 * Calls `send` for one chunk, retrying the whole chunk on a failed HTTP call
 * (Expo answers per message once the call succeeds, so partial failures are
 * handled per ticket, not here).
 */
async function sendChunkWithRetry(
  send: ExpoSendFn,
  messages: ExpoMessage[],
  backoffMs?: number,
): Promise<{ results: ExpoResult[] | null; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
    try {
      return { results: await send(messages) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_CHUNK_ATTEMPTS) {
        const delay = backoffMs ?? BACKOFF_MS[attempt - 1] ?? 2000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return { results: null, error: lastError };
}

function recordOutcome(
  effects: ExpoDeliveryEffects,
  row: MobileTokenRow,
  payload: PushPayload,
  result: ExpoResult | undefined,
  latencyMs: number,
  errorOverride?: string,
) {
  const kind = errorOverride ? "transient" : classifyExpoResult(result);
  const error = errorOverride ?? (result?.status === "error" ? `${result.details?.error ?? "Error"}: ${result.message ?? ""}`.trim() : null);
  effects.counts[kind] += 1;
  effects.logs.push({
    recipientId: row.memberId,
    subscriptionId: row.id,
    endpointHost: EXPO_HOST,
    type: payload.type ?? null,
    tag: payload.tag ?? null,
    ok: kind === "ok",
    statusCode: null,
    error: error ? error.slice(0, 500) : null,
    latencyMs,
  });
  if (kind === "ok") {
    effects.successIds.push(row.id);
    if (result?.id) {
      effects.receipts.push({ receiptId: result.id, tokenId: row.id, memberId: row.memberId });
    }
  } else if (kind === "gone") {
    effects.goneIds.push(row.id);
  } else if (kind === "permanent") {
    effects.permanentFailures.push({
      id: row.id,
      error: error ?? "permanent",
      failCount: row.failCount + 1,
    });
  }
}

export async function deliverToExpoTokens(input: {
  tokens: MobileTokenRow[];
  payload: PushPayload;
  badgeByRecipient: Map<string, number>;
  send: ExpoSendFn;
  /** Test hook: shortens retry backoff. */
  retryBackoffMs?: number;
}): Promise<ExpoDeliveryEffects> {
  const effects = emptyEffects();
  if (input.tokens.length === 0) return effects;

  for (const rows of chunk(input.tokens, EXPO_PUSH_CHUNK_SIZE)) {
    const messages = rows.map((row) =>
      buildExpoMessage(row.token, input.payload, {
        badge: input.badgeByRecipient.get(row.memberId) ?? 0,
      }),
    );
    const startedAt = Date.now();
    const { results, error } = await sendChunkWithRetry(input.send, messages, input.retryBackoffMs);
    const latencyMs = Date.now() - startedAt;
    rows.forEach((row, i) => {
      recordOutcome(effects, row, input.payload, results?.[i], latencyMs, results ? undefined : error);
    });
  }
  return effects;
}

/** Badge-only pushes (iOS). Returns the same effect shape so one writer serves both. */
export async function deliverBadgeSync(input: {
  tokens: MobileTokenRow[];
  badge: number;
  send: ExpoSendFn;
  retryBackoffMs?: number;
}): Promise<ExpoDeliveryEffects> {
  const effects = emptyEffects();
  const payload: PushPayload = { title: "", type: "badge" };
  for (const rows of chunk(input.tokens, EXPO_PUSH_CHUNK_SIZE)) {
    const messages = rows.map((row) => buildBadgeMessage(row.token, input.badge));
    const startedAt = Date.now();
    const { results, error } = await sendChunkWithRetry(input.send, messages, input.retryBackoffMs);
    const latencyMs = Date.now() - startedAt;
    rows.forEach((row, i) => {
      recordOutcome(effects, row, payload, results?.[i], latencyMs, results ? undefined : error);
    });
  }
  // Badge pings are not worth a delivery-log row each; keep only failures.
  effects.logs = effects.logs.filter((l) => !l.ok);
  effects.receipts = [];
  return effects;
}

/** The slice of Prisma the writer needs (tests pass a fake). */
export interface ExpoDeliveryDb {
  pushDeliveryLog: {
    createMany(args: { data: ExpoDeliveryEffects["logs"] }): Promise<unknown>;
  };
  mobilePushToken: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<unknown>;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: {
        failCount?: number | { increment: number };
        lastSuccessAt?: Date;
        lastFailureAt?: Date;
        lastError?: string | null;
      };
    }): Promise<unknown>;
  };
}

export function retiredTokenIds(effects: ExpoDeliveryEffects): string[] {
  return effects.permanentFailures
    .filter((f) => f.failCount >= PUSH_MAX_FAIL_COUNT)
    .map((f) => f.id);
}

export async function applyExpoDeliveryEffects(
  db: ExpoDeliveryDb,
  effects: ExpoDeliveryEffects,
  now: Date = new Date(),
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (effects.logs.length > 0) {
    tasks.push(
      db.pushDeliveryLog.createMany({ data: effects.logs }).catch((err: unknown) =>
        console.error(
          "[push] expo delivery log insert failed:",
          err instanceof Error ? err.message : err,
        ),
      ),
    );
  }

  if (effects.successIds.length > 0) {
    tasks.push(
      db.mobilePushToken
        .updateMany({
          where: { id: { in: effects.successIds } },
          data: { failCount: 0, lastSuccessAt: now, lastError: null },
        })
        .catch(() => {}),
    );
  }

  const byError = new Map<string, string[]>();
  for (const f of effects.permanentFailures) {
    const list = byError.get(f.error) ?? [];
    list.push(f.id);
    byError.set(f.error, list);
  }
  for (const [error, ids] of byError) {
    tasks.push(
      db.mobilePushToken
        .updateMany({
          where: { id: { in: ids } },
          data: { failCount: { increment: 1 }, lastFailureAt: now, lastError: error.slice(0, 500) },
        })
        .catch(() => {}),
    );
  }

  const toDelete = [...new Set([...effects.goneIds, ...retiredTokenIds(effects)])];
  if (toDelete.length > 0) {
    tasks.push(
      Promise.all(tasks.slice())
        .then(() => db.mobilePushToken.deleteMany({ where: { id: { in: toDelete } } }))
        .catch(() => {}),
    );
  }

  await Promise.all(tasks);
}

/**
 * Receipts are where APNs/FCM rejections show up (a ticket only says Expo
 * accepted the message). Called ~15 minutes after the send with the tickets
 * recorded in `effects.receipts`.
 */
export async function processExpoReceipts(input: {
  pending: PendingReceipt[];
  fetchReceipts: ExpoReceiptsFn;
  db: ExpoDeliveryDb;
  now?: Date;
}): Promise<{ checked: number; gone: number; permanent: number; transient: number }> {
  const summary = { checked: 0, gone: 0, permanent: 0, transient: 0 };
  if (input.pending.length === 0) return summary;

  const byReceipt = new Map(input.pending.map((p) => [p.receiptId, p]));
  const effects = emptyEffects();

  for (const ids of chunk([...byReceipt.keys()], EXPO_RECEIPT_CHUNK_SIZE)) {
    let receipts: Record<string, ExpoResult>;
    try {
      receipts = await input.fetchReceipts(ids);
    } catch (err) {
      console.error(
        "[push] expo receipts fetch failed:",
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    for (const id of ids) {
      const receipt = receipts[id];
      if (!receipt) continue; // not published yet or expired — nothing to learn
      summary.checked += 1;
      const kind = classifyExpoResult(receipt);
      const p = byReceipt.get(id)!;
      if (kind === "gone") {
        summary.gone += 1;
        effects.goneIds.push(p.tokenId);
      } else if (kind === "permanent") {
        summary.permanent += 1;
        effects.permanentFailures.push({
          id: p.tokenId,
          error: `${receipt.details?.error ?? "Error"}: ${receipt.message ?? ""}`.trim(),
          // The ticket already counted as a success; a receipt failure is one strike.
          failCount: 1,
        });
      } else if (kind === "transient") {
        summary.transient += 1;
      }
      if (kind !== "ok") {
        effects.logs.push({
          recipientId: p.memberId,
          subscriptionId: p.tokenId,
          endpointHost: EXPO_HOST,
          type: "receipt",
          tag: null,
          ok: false,
          statusCode: null,
          error: `${receipt.details?.error ?? "Error"}: ${receipt.message ?? ""}`.trim().slice(0, 500),
          latencyMs: 0,
        });
      }
    }
  }

  await applyExpoDeliveryEffects(input.db, effects, input.now);
  return summary;
}
