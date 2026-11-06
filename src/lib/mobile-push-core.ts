// Pure helpers for Expo push (the native mobile app). No I/O, no Next imports:
// the worker image copies src/lib and runs this with tsx, and the unit tests
// exercise the policy directly.

import { PUSH_TTL_SECONDS, threadKeyFromPushTag, type PushPayload } from "./push-core";

/** Android notification channel the app creates on first launch. */
export const MOBILE_PUSH_CHANNEL_ID = "messages";

/** Expo rejects more than this many messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100;
/** …and this many receipt ids per request. */
export const EXPO_RECEIPT_CHUNK_SIZE = 300;

/**
 * Expo publishes receipts a little after delivery; checking too early returns
 * nothing useful. 15 minutes is Expo's own recommendation.
 */
export const EXPO_RECEIPT_DELAY_MS = 15 * 60 * 1000;

export type MobilePlatform = "ios" | "android";

export function isMobilePlatform(value: unknown): value is MobilePlatform {
  return value === "ios" || value === "android";
}

/** `ExponentPushToken[…]` / `ExpoPushToken[…]` — what expo-notifications hands the app. */
export function isExpoPushTokenString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(value)
  );
}

/** Opaque per-install id the app generates; bounded so it can be an index key. */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

export interface MobileTokenRow {
  id: string;
  memberId: string;
  token: string;
  deviceId: string | null;
  platform: string;
  failCount: number;
}

/** Shape sent to Expo (subset of expo-server-sdk's ExpoPushMessage). */
export interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  ttl?: number;
  channelId?: string;
  /** iOS: groups banners per chat in Notification Center. */
  threadId?: string;
  /** iOS: removes any wake-up; the payload only updates the badge. */
  contentAvailable?: boolean;
}

/** What the app reads from `notification.request.content.data`. */
export interface MobilePushData {
  kind: "notification" | "badge";
  url?: string;
  threadId?: string;
  tag?: string;
  type?: string;
}

/**
 * One chat/bell notification for one device. `badge` is the person's inbox
 * unread total (what the app's Chats tab shows), not the bell count.
 */
export function buildExpoMessage(
  token: string,
  payload: PushPayload,
  opts: { badge: number },
): ExpoMessage {
  const threadKey = threadKeyFromPushTag(payload.tag) ?? undefined;
  const data: MobilePushData = {
    kind: "notification",
    url: payload.url,
    threadId: threadKey,
    tag: payload.tag,
    type: payload.type,
  };
  return {
    to: token,
    title: payload.title,
    body: payload.body || undefined,
    data: { ...data },
    sound: "default",
    badge: opts.badge,
    priority: "high",
    ttl: PUSH_TTL_SECONDS,
    channelId: MOBILE_PUSH_CHANNEL_ID,
    threadId: threadKey,
  };
}

/**
 * Silent badge update after the person read something elsewhere (web, another
 * phone). No title/body, so iOS only changes the number on the icon. Sent to
 * iOS only: Android launchers take the badge from the app itself.
 */
export function buildBadgeMessage(token: string, badge: number): ExpoMessage {
  const data: MobilePushData = { kind: "badge" };
  return {
    to: token,
    badge,
    sound: null,
    priority: "normal",
    ttl: 60 * 60,
    data: { ...data },
  };
}

export type ExpoOutcome = "ok" | "gone" | "permanent" | "transient";

type ExpoErrorCode =
  | "DeveloperError"
  | "DeviceNotRegistered"
  | "ExpoError"
  | "InvalidCredentials"
  | "MessageRateExceeded"
  | "MessageTooBig"
  | "ProviderError";

/** Ticket (immediate) and receipt (later) share one error shape. */
export interface ExpoResult {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: ExpoErrorCode | string; expoPushToken?: string };
}

/**
 * What to do with a token after Expo answered for it.
 *  - gone: the app was uninstalled or notifications revoked — drop the token.
 *  - permanent: will fail again as-is (bad credentials, oversized) — count it.
 *  - transient: rate limit / provider hiccup — leave the token alone.
 */
export function classifyExpoResult(result: ExpoResult | undefined): ExpoOutcome {
  if (!result) return "transient";
  if (result.status === "ok") return "ok";
  switch (result.details?.error) {
    case "DeviceNotRegistered":
      return "gone";
    case "InvalidCredentials":
    case "MessageTooBig":
    case "DeveloperError":
      return "permanent";
    default:
      return "transient";
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Deterministic job id for a badge sync; coalesces bursts within one window. */
export function badgeSyncJobId(userId: string, now: number = Date.now()): string {
  return `mobile-badge-${userId}-${Math.floor(now / 2000)}`;
}
