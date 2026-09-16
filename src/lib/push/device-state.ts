import "server-only";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  DEVICE_REPORT_MIN_INTERVAL_S,
  type PushDeviceReport,
} from "@/lib/push/device-report";

/**
 * Upsert the admin-visible state of one install. Every field is optional so
 * the subscribe route can mark a device enabled without the full report.
 */
export async function upsertPushDevice(
  userId: string,
  deviceId: string,
  patch: Partial<Omit<PushDeviceReport, "deviceId">>,
  opts: { touchEnabledAt?: boolean } = {},
): Promise<void> {
  const now = new Date();
  const data = {
    ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
    ...(patch.standalone !== undefined ? { standalone: patch.standalone } : {}),
    ...(patch.permission !== undefined ? { permission: patch.permission } : {}),
    ...(patch.supportReason !== undefined ? { supportReason: patch.supportReason } : {}),
    ...(patch.hasSubscription !== undefined ? { hasSubscription: patch.hasSubscription } : {}),
    ...(patch.registered !== undefined ? { registered: patch.registered } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.lastReason !== undefined ? { lastReason: patch.lastReason } : {}),
    ...(patch.lastDetail !== undefined ? { lastDetail: patch.lastDetail } : {}),
    ...(patch.userAgent !== undefined && patch.userAgent !== null
      ? { userAgent: patch.userAgent }
      : {}),
    ...(patch.appBuild !== undefined && patch.appBuild !== null
      ? { appBuild: patch.appBuild }
      : {}),
    lastSeenAt: now,
    ...(opts.touchEnabledAt || patch.enabled === true ? { lastEnabledAt: now } : {}),
  };

  await prisma.pushDevice.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId, ...data },
    update: data,
  });
}

/** Marks the device seen without changing anything else. */
export async function touchPushDevice(userId: string, deviceId: string): Promise<void> {
  await prisma.pushDevice
    .upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId },
      update: { lastSeenAt: new Date() },
    })
    .catch(() => {});
}

/**
 * One accepted report per device per DEVICE_REPORT_MIN_INTERVAL_S. Redis
 * SET NX EX; if Redis is unavailable the report is allowed (telemetry must
 * never depend on the queue being up).
 */
export async function allowDeviceReport(userId: string, deviceId: string): Promise<boolean> {
  try {
    const res = await getRedis().set(
      `push:device-report:${userId}:${deviceId}`,
      "1",
      "EX",
      DEVICE_REPORT_MIN_INTERVAL_S,
      "NX",
    );
    return res === "OK";
  } catch {
    return true;
  }
}

/** Reads a JSON body with a hard size cap. Returns undefined when too large or invalid. */
export async function readJsonCapped(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; status: 400 | 413 }> {
  const text = await req.text().catch(() => null);
  if (text === null) return { ok: false, status: 400 };
  if (text.length > maxBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, status: 400 };
  }
}
