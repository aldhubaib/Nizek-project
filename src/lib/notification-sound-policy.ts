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
}

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
 *   links to.
 */
export function shouldPlayNotificationSound(
  payload: SoundEventPayload | null | undefined,
  ctx: SoundContext,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.type !== NOTIFICATION_NEW) return false;
  if (!ctx.appFocused) return false;

  const linkUrl = payload.notification?.linkUrl;
  if (linkUrl && isViewingLink(ctx.pathname, linkUrl)) return false;

  return true;
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
