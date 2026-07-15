import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import {
  buildPushBody,
  endpointHost,
  isGoneStatus,
  sendWithRetry,
  PUSH_TTL_SECONDS,
  type PushPayload,
} from "@/lib/push-core";

export type { PushPayload };

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
} else {
  console.warn(
    "[push] VAPID keys missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — web push is DISABLED",
  );
}

export function isPushConfigured(): boolean {
  return configured;
}

/**
 * Deliver an OS-level web-push to EVERY device registered by the given
 * recipients. Whether a banner is actually shown is decided per-device by the
 * service worker (it suppresses the banner when the app is focused and visible
 * there — WhatsApp behavior). Sends use Urgency: high + a 24h TTL, retry once
 * on transient failures, and record every attempt to PushDeliveryLog. Never
 * throws; push is best-effort on top of the in-app bell.
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

    // Per-recipient unread count powers the OS app badge.
    const grouped = await prisma.notification.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: unique }, read: false },
      _count: { _all: true },
    });
    const unreadByRecipient = new Map(
      grouped.map((g) => [g.recipientId, g._count._all]),
    );

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const body = buildPushBody(payload, {
          badge: unreadByRecipient.get(sub.memberId) ?? 0,
          fallbackUrl: APP_URL || "/dashboard",
        });

        const startedAt = Date.now();
        const outcome = await sendWithRetry(() =>
          webpush
            .sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              body,
              { TTL: PUSH_TTL_SECONDS, urgency: "high" },
            )
            .then(() => undefined),
        );
        const latencyMs = Date.now() - startedAt;

        if (!outcome.ok && isGoneStatus(outcome.statusCode)) {
          // Endpoint gone / unsubscribed — drop the stale subscription.
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        }

        await prisma.pushDeliveryLog
          .create({
            data: {
              recipientId: sub.memberId,
              subscriptionId: sub.id,
              endpointHost: endpointHost(sub.endpoint),
              type: payload.type ?? null,
              tag: payload.tag ?? null,
              ok: outcome.ok,
              statusCode: outcome.statusCode ?? null,
              error: outcome.error?.slice(0, 500) ?? null,
              latencyMs,
            },
          })
          .catch(() => {});

        return outcome;
      }),
    );

    const failed = results.filter(
      (r) => r.status === "fulfilled" && !r.value.ok,
    ).length;
    if (failed > 0) {
      console.error(
        `[push] ${failed}/${subscriptions.length} sends failed (tag=${payload.tag ?? "-"})`,
      );
    }
  } catch (err) {
    // Push is best-effort; log and swallow so callers are never affected.
    console.error(
      "[push] sendPush failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
