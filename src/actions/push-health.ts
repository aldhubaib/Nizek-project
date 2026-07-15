"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isPushConfigured } from "@/lib/push";
import { isCentrifugoConfigured } from "@/lib/centrifugo";

export type PushHealthDTO = {
  vapidConfigured: boolean;
  centrifugoConfigured: boolean;
  totalUsers: number;
  usersWithPush: number;
  usersWithoutPush: { id: string; name: string | null; email: string }[];
  totalSubscriptions: number;
  last7d: {
    attempts: number;
    delivered: number;
    failed: number;
    successRate: number | null;
    failuresByStatus: { statusCode: number | null; count: number }[];
  };
  recentFailures: {
    id: string;
    recipientName: string | null;
    recipientEmail: string;
    statusCode: number | null;
    error: string | null;
    endpointHost: string | null;
    createdAt: Date;
  }[];
};

/** Aggregate push-delivery health for the admin dashboard. Admin only. */
export async function getPushHealth(): Promise<PushHealthDTO> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [users, subCount, attempts, delivered, failuresByStatusRaw, recentFailuresRaw] =
    await Promise.all([
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
      prisma.pushDeliveryLog.count({ where: { createdAt: { gte: since } } }),
      prisma.pushDeliveryLog.count({
        where: { createdAt: { gte: since }, ok: true },
      }),
      prisma.pushDeliveryLog.groupBy({
        by: ["statusCode"],
        where: { createdAt: { gte: since }, ok: false },
        _count: { _all: true },
        orderBy: { _count: { statusCode: "desc" } },
      }),
      prisma.pushDeliveryLog.findMany({
        where: { ok: false },
        include: {
          recipient: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const usersWithoutPush = users
    .filter((u) => u._count.pushSubscriptions === 0)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const failed = attempts - delivered;

  return {
    vapidConfigured: isPushConfigured(),
    centrifugoConfigured: isCentrifugoConfigured(),
    totalUsers: users.length,
    usersWithPush: users.length - usersWithoutPush.length,
    usersWithoutPush,
    totalSubscriptions: subCount,
    last7d: {
      attempts,
      delivered,
      failed,
      successRate: attempts > 0 ? delivered / attempts : null,
      failuresByStatus: failuresByStatusRaw.map((f) => ({
        statusCode: f.statusCode,
        count: f._count._all,
      })),
    },
    recentFailures: recentFailuresRaw.map((f) => ({
      id: f.id,
      recipientName: f.recipient.name,
      recipientEmail: f.recipient.email,
      statusCode: f.statusCode,
      error: f.error,
      endpointHost: f.endpointHost,
      createdAt: f.createdAt,
    })),
  };
}
