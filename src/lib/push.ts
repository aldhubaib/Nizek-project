import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getPresenceDeviceIds, userChannel } from "@/lib/centrifugo";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const configured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (configured) {
  webpush.setVapidDetails(
    "mailto:admin@nizek.com",
    VAPID_PUBLIC!,
    VAPID_PRIVATE!,
  );
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /** Notification icon: sender avatar or project thumbnail. */
  icon?: string;
}

/**
 * Deliver an OS-level web-push to every device registered by the given
 * recipients. Best-effort and fire-and-forget: the in-app notification bell is
 * fed separately via the `Notification` table + Centrifugo, so this only adds
 * the browser/mobile push on top. Never throws.
 */
export async function sendPush(
  recipientIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!configured) return;
  const unique = [...new Set(recipientIds)].filter(Boolean);
  if (unique.length === 0) return;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { memberId: { in: unique } },
    });
    if (subscriptions.length === 0) return;

    // Presence-aware push: for each recipient, find which of their devices are
    // currently connected to Centrifugo (foreground/active). We skip OS push to
    // those devices — they already get the in-app chime/bell — but still push to
    // their other (backgrounded/closed) devices and to recipients with none
    // connected. Best-effort: if presence is unavailable we push everywhere.
    const connectedByRecipient = new Map<string, Set<string>>();
    await Promise.all(
      unique.map(async (rid) => {
        const devices = await getPresenceDeviceIds(userChannel(rid));
        if (devices.size > 0) connectedByRecipient.set(rid, devices);
      }),
    );

    // Per-recipient unread count powers the OS app badge.
    const grouped = await prisma.notification.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: unique }, read: false },
      _count: { _all: true },
    });
    const unreadByRecipient = new Map(
      grouped.map((g) => [g.recipientId, g._count._all]),
    );

    // Drop subscriptions whose device is currently connected/active.
    const targets = subscriptions.filter((sub) => {
      if (!sub.deviceId) return true;
      const connected = connectedByRecipient.get(sub.memberId);
      return !connected?.has(sub.deviceId);
    });
    if (targets.length === 0) return;

    await Promise.allSettled(
      targets.map((sub) => {
        const body = JSON.stringify({
          title: payload.title,
          body: payload.body || "",
          url: payload.url || APP_URL || "/dashboard",
          badge: unreadByRecipient.get(sub.memberId) ?? 0,
          tag: payload.tag,
          icon: payload.icon,
        });
        return webpush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          )
          .catch(async (err: { statusCode?: number }) => {
            // Endpoint gone / unsubscribed — drop the stale subscription.
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              await prisma.pushSubscription
                .delete({ where: { id: sub.id } })
                .catch(() => {});
            }
          });
      }),
    );
  } catch {
    // Push is best-effort; swallow all errors so callers are never affected.
  }
}
