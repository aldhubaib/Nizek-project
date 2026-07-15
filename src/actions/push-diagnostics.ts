"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isCentrifugoConfigured } from "@/lib/centrifugo";
import { isPushConfigured, sendPush } from "@/lib/push";
import { createAndPublishNotifications } from "@/lib/notify";

export type PushDiagnosticsDTO = {
  vapidConfigured: boolean;
  centrifugoConfigured: boolean;
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

  const [devices, recentDeliveries] = await Promise.all([
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
  ]);

  return {
    vapidConfigured: isPushConfigured(),
    centrifugoConfigured: isCentrifugoConfigured(),
    subscriptionCount: devices.length,
    devices,
    recentDeliveries,
  };
}

/**
 * Sends a real end-to-end test notification to the calling user: a Notification
 * row + bell event + web push to every registered device. Exercises the exact
 * production pipeline, so a silent failure here shows up in the delivery log.
 */
export async function sendTestNotification(): Promise<{
  pushed: boolean;
  deviceCount: number;
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
  // Await (rather than fire-and-forget) so the delivery log is written before
  // the diagnostics panel refreshes.
  await sendPush([user.id], {
    title,
    body,
    url: "/dashboard/account",
    tag,
    type: "test",
  });

  return { pushed: isPushConfigured() && deviceCount > 0, deviceCount };
}
