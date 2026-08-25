// Pure decision logic for the in-app notification chime. Unit tested — keep
// free of browser globals; the caller passes the current context in.

import { NOTIFICATION_NEW } from "@/lib/channels";

export interface SoundEventPayload {
  type?: string;
  authorId?: string;
  notification?: { linkUrl?: string | null } | null;
}

export interface SoundContext {
  currentUserId?: string;
  /** document.visibilityState === "visible" && document.hasFocus() */
  appFocused: boolean;
  /** Current location.pathname, used to skip the chime for the open thread. */
  pathname: string;
  /** Per-device / server-synced preference. Defaults to enabled. */
  soundEnabled?: boolean;
}

export type SoundDecisionReason =
  | "played"
  | "invalid-payload"
  | "not-notification-new"
  | "app-not-focused"
  | "viewing-thread"
  | "self-authored"
  | "sound-disabled";

export type SoundDecision = {
  play: boolean;
  reason: SoundDecisionReason;
};

/**
 * WhatsApp behavior:
 * - Chime ONLY for `notification.new` — the per-recipient event that already
 *   honors server-side preferences and thread mutes. `inbox` deltas, read-sync
 *   events, and everything else on the user channel stay silent (fixes the
 *   phantom chime on notification.read and the missing-preference gap on inbox).
 * - No chime when the app isn't focused/visible — the OS push (with the OS
 *   notification sound) covers that case since the service worker only
 *   suppresses banners for focused-visible clients.
 * - No chime when the user is already looking at the thread the notification
 *   links to, or when the current user authored it.
 */
export function decideNotificationSound(
  payload: SoundEventPayload | null | undefined,
  ctx: SoundContext,
): SoundDecision {
  if (!payload || typeof payload !== "object") {
    return { play: false, reason: "invalid-payload" };
  }
  if (payload.type !== NOTIFICATION_NEW) {
    return { play: false, reason: "not-notification-new" };
  }
  if (!ctx.appFocused) {
    return { play: false, reason: "app-not-focused" };
  }
  if (
    ctx.currentUserId &&
    payload.authorId &&
    payload.authorId === ctx.currentUserId
  ) {
    return { play: false, reason: "self-authored" };
  }

  const linkUrl = payload.notification?.linkUrl;
  if (linkUrl && isViewingLink(ctx.pathname, linkUrl)) {
    return { play: false, reason: "viewing-thread" };
  }

  if (ctx.soundEnabled === false) {
    return { play: false, reason: "sound-disabled" };
  }

  return { play: true, reason: "played" };
}

export function shouldPlayNotificationSound(
  payload: SoundEventPayload | null | undefined,
  ctx: SoundContext,
): boolean {
  return decideNotificationSound(payload, ctx).play;
}

/** True when the current pathname is the page the notification links to. */
export function isViewingLink(pathname: string, linkUrl: string): boolean {
  try {
    const linkPath = linkUrl.startsWith("http")
      ? new URL(linkUrl).pathname
      : linkUrl.split("?")[0];
    const current = pathname.split("?")[0].replace(/\/$/, "");
    const target = linkPath.replace(/\/$/, "");
    return current === target;
  } catch {
    return false;
  }
}
