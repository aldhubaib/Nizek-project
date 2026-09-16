"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isCentrifugoConfigured } from "@/lib/centrifugo";
import { isPushConfigured } from "@/lib/push";
import { assessPushQueue, type PushQueueAssessment } from "@/lib/push-core";
import { getPushQueueHealth } from "@/lib/push-queue";
import { notifyAndPush } from "@/lib/notify";

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
    platform: string | null;
    failCount: number;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastFailureStatus: number | null;
    createdAt: Date;
  }[];
  /** What the server last heard from THIS install (null if never reported). */
  thisDevice: {
    permission: string | null;
    enabled: boolean;
    lastReason: string | null;
    lastDetail: string | null;
    lastSeenAt: Date;
    lastEnabledAt: Date | null;
  } | null;
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
export async function getPushDiagnostics(deviceId?: string): Promise<PushDiagnosticsDTO> {
  const user = await requireUser();

  const [devices, thisDevice, recentDeliveries, queueHealth] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: { memberId: user.id },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        platform: true,
        failCount: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        lastFailureStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    deviceId
      ? prisma.pushDevice.findUnique({
          where: { userId_deviceId: { userId: user.id, deviceId } },
          select: {
            permission: true,
            enabled: true,
            lastReason: true,
            lastDetail: true,
            lastSeenAt: true,
            lastEnabledAt: true,
          },
        })
      : Promise.resolve(null),
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
    thisDevice,
    recentDeliveries,
  };
}

/**
 * Sends a real end-to-end test notification to the calling user through the
 * exact production path (Notification row + outbox + worker). Sending inline
 * once made the test pass while a stopped worker swallowed every genuine
 * notification — the scenario users open this panel to diagnose.
 */
export async function sendTestNotification(): Promise<{
  queued: boolean;
  deviceCount: number;
  /** Set when the push could not even be recorded for delivery. */
  queueError: string | null;
}> {
  const user = await requireUser();
  const title = "Test notification";
  const body = "If you can read this, notifications reach this account.";
  const tag = `test-${user.id}`;

  let queueError: string | null = null;
  try {
    await notifyAndPush(
      { recipientIds: [user.id], type: "test", title, body, linkUrl: "/dashboard/account", tag },
      { title, body, url: "/dashboard/account", type: "test" },
    );
  } catch (err) {
    queueError = err instanceof Error ? err.message : "Failed to queue the push.";
  }

  const deviceCount = await prisma.pushSubscription.count({
    where: { memberId: user.id },
  });

  return {
    queued: queueError === null && isPushConfigured() && deviceCount > 0,
    deviceCount,
    queueError,
  };
}
