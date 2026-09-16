import "server-only";
import { prisma } from "@/lib/prisma";
import { touchPushDevice } from "@/lib/push/device-state";

export interface PushStatusResponse {
  /** The server holds a row for this endpoint under this user. */
  registered: boolean;
  subscriptionId: string | null;
  /** Consecutive permanent failures on that row (0 when healthy). */
  failCount: number;
  /** Hash of the VAPID key the row was created with, if recorded. */
  vapidKeyHash: string | null;
  /** Server time, so clients can detect wildly skewed clocks in diagnostics. */
  serverTime: string;
}

/**
 * One round-trip status for the client: is this endpoint registered, and how
 * healthy is it. Also stamps the device as seen so the admin fleet view knows
 * the install is alive even when it never needs to re-subscribe.
 */
export async function getStatusForEndpoint(
  userId: string,
  endpoint: string | null,
  deviceId: string | null,
): Promise<PushStatusResponse> {
  const row = endpoint
    ? await prisma.pushSubscription.findFirst({
        where: { endpoint, memberId: userId },
        select: { id: true, failCount: true, vapidKeyHash: true },
      })
    : null;

  if (deviceId) void touchPushDevice(userId, deviceId);

  return {
    registered: row != null,
    subscriptionId: row?.id ?? null,
    failCount: row?.failCount ?? 0,
    vapidKeyHash: row?.vapidKeyHash ?? null,
    serverTime: new Date().toISOString(),
  };
}
