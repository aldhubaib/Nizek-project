"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isPushConfigured } from "@/lib/push";
import { isCentrifugoConfigured } from "@/lib/centrifugo";
import { getPushQueueHealth } from "@/lib/push-queue";

export type PushFleetDevice = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  deviceId: string;
  platform: string | null;
  standalone: boolean | null;
  permission: string | null;
  supportReason: string | null;
  enabled: boolean;
  hasSubscription: boolean;
  registered: boolean;
  lastReason: string | null;
  lastDetail: string | null;
  appBuild: string | null;
  lastSeenAt: Date;
  lastEnabledAt: Date | null;
};

export type PushHealthDTO = {
  vapidConfigured: boolean;
  centrifugoConfigured: boolean;
  totalUsers: number;
  usersWithPush: number;
  usersWithoutPush: { id: string; name: string | null; email: string }[];
  totalSubscriptions: number;
  /** Subscriptions with at least one permanent failure recorded. */
  unhealthySubscriptions: number;
  queue: {
    reachable: boolean;
    waiting: number;
    active: number;
    failed: number;
    lastCompletedAt: Date | null;
    outboxPending: number;
    outboxOldestAgeMs: number | null;
  };
  lastHour: {
    attempts: number;
    delivered: number;
    /** Sends per minute over the last hour. */
    perMinute: number;
    p95LatencyMs: number | null;
  };
  last7d: {
    attempts: number;
    delivered: number;
    failed: number;
    successRate: number | null;
    failuresByStatus: { statusCode: number | null; count: number }[];
  };
  /** Every install that reported in, most recently seen first. */
  fleet: PushFleetDevice[];
  recentFailures: {
    id: string;
    recipientId: string;
    recipientName: string | null;
    recipientEmail: string;
    statusCode: number | null;
    error: string | null;
    endpointHost: string | null;
    createdAt: Date;
  }[];
};

function requireAdmin() {
  return requireUser().then((user) => {
    if (user.systemRole !== "ADMIN") throw new Error("Admin only");
    return user;
  });
}

/** Aggregate push-delivery health for the admin dashboard. Admin only. */
export async function getPushHealth(): Promise<PushHealthDTO> {
  await requireAdmin();

  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since1h = new Date(now - 60 * 60 * 1000);

  const [
    users,
    subCount,
    unhealthySubscriptions,
    attempts,
    delivered,
    failuresByStatusRaw,
    recentFailuresRaw,
    hourLogs,
    fleetRaw,
    queue,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { blocked: false },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { pushSubscriptions: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pushSubscription.count(),
    prisma.pushSubscription.count({ where: { failCount: { gt: 0 } } }),
    prisma.pushDeliveryLog.count({ where: { createdAt: { gte: since7d } } }),
    prisma.pushDeliveryLog.count({ where: { createdAt: { gte: since7d }, ok: true } }),
    prisma.pushDeliveryLog.groupBy({
      by: ["statusCode"],
      where: { createdAt: { gte: since7d }, ok: false },
      _count: { _all: true },
      orderBy: { _count: { statusCode: "desc" } },
    }),
    prisma.pushDeliveryLog.findMany({
      where: { ok: false },
      include: { recipient: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.pushDeliveryLog.findMany({
      where: { createdAt: { gte: since1h } },
      select: { ok: true, latencyMs: true },
    }),
    prisma.pushDevice.findMany({
      include: { user: { select: { name: true, email: true, blocked: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: 500,
    }),
    getPushQueueHealth(),
  ]);

  const usersWithoutPush = users
    .filter((u) => u._count.pushSubscriptions === 0)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const latencies = hourLogs
    .map((l) => l.latencyMs)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  const p95 =
    latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
      : null;

  return {
    vapidConfigured: isPushConfigured(),
    centrifugoConfigured: isCentrifugoConfigured(),
    totalUsers: users.length,
    usersWithPush: users.length - usersWithoutPush.length,
    usersWithoutPush,
    totalSubscriptions: subCount,
    unhealthySubscriptions,
    queue: {
      reachable: queue.reachable,
      waiting: queue.waiting,
      active: queue.active,
      failed: queue.failed,
      lastCompletedAt: queue.lastCompletedAt,
      outboxPending: queue.outboxPending,
      outboxOldestAgeMs: queue.outboxOldestAgeMs,
    },
    lastHour: {
      attempts: hourLogs.length,
      delivered: hourLogs.filter((l) => l.ok).length,
      perMinute: Math.round((hourLogs.length / 60) * 10) / 10,
      p95LatencyMs: p95,
    },
    last7d: {
      attempts,
      delivered,
      failed: attempts - delivered,
      successRate: attempts > 0 ? delivered / attempts : null,
      failuresByStatus: failuresByStatusRaw.map((f) => ({
        statusCode: f.statusCode,
        count: f._count._all,
      })),
    },
    fleet: fleetRaw
      .filter((d) => !d.user.blocked)
      .map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        userEmail: d.user.email,
        deviceId: d.deviceId,
        platform: d.platform,
        standalone: d.standalone,
        permission: d.permission,
        supportReason: d.supportReason,
        enabled: d.enabled,
        hasSubscription: d.hasSubscription,
        registered: d.registered,
        lastReason: d.lastReason,
        lastDetail: d.lastDetail,
        appBuild: d.appBuild,
        lastSeenAt: d.lastSeenAt,
        lastEnabledAt: d.lastEnabledAt,
      })),
    recentFailures: recentFailuresRaw.map((f) => ({
      id: f.id,
      recipientId: f.recipientId,
      recipientName: f.recipient.name,
      recipientEmail: f.recipient.email,
      statusCode: f.statusCode,
      error: f.error,
      endpointHost: f.endpointHost,
      createdAt: f.createdAt,
    })),
  };
}

export type PushUserDrilldownDTO = {
  user: { id: string; name: string | null; email: string };
  devices: PushFleetDevice[];
  subscriptions: {
    id: string;
    endpointHost: string | null;
    deviceId: string | null;
    platform: string | null;
    standalone: boolean | null;
    failCount: number;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastFailureStatus: number | null;
    createdAt: Date;
  }[];
  deliveries: {
    id: string;
    ok: boolean;
    statusCode: number | null;
    error: string | null;
    endpointHost: string | null;
    type: string | null;
    createdAt: Date;
  }[];
};

/** One user's devices, subscriptions and last 20 deliveries. Admin only. */
export async function getPushUserDrilldown(userId: string): Promise<PushUserDrilldownDTO> {
  await requireAdmin();

  const [user, devices, subscriptions, deliveries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    prisma.pushDevice.findMany({
      where: { userId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.pushSubscription.findMany({
      where: { memberId: userId },
      select: {
        id: true,
        endpoint: true,
        deviceId: true,
        platform: true,
        standalone: true,
        failCount: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        lastFailureStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pushDeliveryLog.findMany({
      where: { recipientId: userId },
      select: {
        id: true,
        ok: true,
        statusCode: true,
        error: true,
        endpointHost: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  if (!user) throw new Error("User not found");

  return {
    user,
    devices: devices.map((d) => ({
      id: d.id,
      userId: d.userId,
      userName: d.user.name,
      userEmail: d.user.email,
      deviceId: d.deviceId,
      platform: d.platform,
      standalone: d.standalone,
      permission: d.permission,
      supportReason: d.supportReason,
      enabled: d.enabled,
      hasSubscription: d.hasSubscription,
      registered: d.registered,
      lastReason: d.lastReason,
      lastDetail: d.lastDetail,
      appBuild: d.appBuild,
      lastSeenAt: d.lastSeenAt,
      lastEnabledAt: d.lastEnabledAt,
    })),
    subscriptions: subscriptions.map((s) => {
      let host: string | null = null;
      try {
        host = new URL(s.endpoint).host;
      } catch {
        host = null;
      }
      return {
        id: s.id,
        endpointHost: host,
        deviceId: s.deviceId,
        platform: s.platform,
        standalone: s.standalone,
        failCount: s.failCount,
        lastSuccessAt: s.lastSuccessAt,
        lastFailureAt: s.lastFailureAt,
        lastFailureStatus: s.lastFailureStatus,
        createdAt: s.createdAt,
      };
    }),
    deliveries,
  };
}
