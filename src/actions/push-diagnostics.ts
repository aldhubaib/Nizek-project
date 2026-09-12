"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isCentrifugoConfigured } from "@/lib/centrifugo";
import { isPushConfigured } from "@/lib/push";
import { assessPushQueue, type PushQueueAssessment } from "@/lib/push-core";
import { enqueuePushBounded, getPushQueueHealth } from "@/lib/push-queue";
import { createAndPublishNotifications } from "@/lib/notify";

export type PushDiagnosticsDTO = {
  vapidConfigured: boolean;
  centrifugoConfigured: boolean;
  /** Verdict on the queue every real notification passes through. */
  queue: PushQueueAssessment;
  subscriptionCount: number;
  devices: {
    id: string;
    deviceId: string | null;
    userAgent: string | null;
    createdAt: Date;
  }[];
  recentDeliveries: {
    id: string;
    ok: boolean;
    statusCode: number | null;
    error: string | null;
    endpointHost: string | null;
    createdAt: Date;
  }[];
};

/** Server-side health facts for the account diagnostics panel. */
export async function getPushDiagnostics(): Promise<PushDiagnosticsDTO> {
  const user = await requireUser();

  const [devices, recentDeliveries, queueHealth] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: { memberId: user.id },
      select: { id: true, deviceId: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pushDeliveryLog.findMany({
      where: { recipientId: user.id },
      select: {
        id: true,
        ok: true,
        statusCode: true,
        error: true,
        endpointHost: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getPushQueueHealth(),
  ]);

  return {
    vapidConfigured: isPushConfigured(),
    centrifugoConfigured: isCentrifugoConfigured(),
    queue: assessPushQueue(queueHealth),
    subscriptionCount: devices.length,
    devices,
    recentDeliveries,
  };
}

/**
 * Sends a real end-to-end test notification to the calling user: a Notification
 * row + bell event + web push to every registered device.
 *
 * This deliberately goes through the same queue as real notifications instead
 * of sending inline. Sending inline made the test pass while a stopped worker
 * silently swallowed every genuine notification — the exact scenario users
 * open this panel to diagnose.
 */
export async function sendTestNotification(): Promise<{
  queued: boolean;
  deviceCount: number;
  /** Set when the job could not even be enqueued (queue unreachable). */
  queueError: string | null;
}> {
  const user = await requireUser();
  const title = "Test notification";
  const body = "If you can read this, notifications reach this account.";
  const tag = `test-${user.id}`;

  await createAndPublishNotifications({
    recipientIds: [user.id],
    type: "test",
    title,
    body,
    linkUrl: "/dashboard/account",
    tag,
  });

  const deviceCount = await prisma.pushSubscription.count({
    where: { memberId: user.id },
  });

  let queueError: string | null = null;
  try {
    await enqueuePushBounded([user.id], {
      title,
      body,
      url: "/dashboard/account",
      tag,
      type: "test",
    });
  } catch (err) {
    queueError = err instanceof Error ? err.message : "Failed to queue the push.";
  }

  return {
    queued: queueError === null && isPushConfigured() && deviceCount > 0,
    deviceCount,
    queueError,
  };
}
