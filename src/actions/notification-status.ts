"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { endpointHost } from "@/lib/push-core";
import { isPushConfigured, sendPush } from "@/lib/push";
import { createAndPublishNotifications } from "@/lib/notify";

export type MemberNotificationDevice = {
  id: string;
  /** Human label like "iPhone · Safari" derived from the user agent. */
  label: string;
  /** Where the subscription was created: installed PWA, browser tab, or unknown (pre-tracking row). */
  kind: "pwa" | "web" | "unknown";
  lastActiveAt: Date;
};

export type MemberNotificationStatus = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  /** Has at least one push subscription from a browser tab. */
  webOn: boolean;
  /** Has at least one push subscription from an installed PWA. */
  pwaOn: boolean;
  devices: MemberNotificationDevice[];
  /** Most recent notification created for this member, with open state. */
  lastNotification: {
    title: string;
    createdAt: Date;
    read: boolean;
    readAt: Date | null;
  } | null;
  /** Most recent successful OS push delivery to any of their devices. */
  lastPushDeliveredAt: Date | null;
  unreadCount: number;
};

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  // Order matters: Edge/Chrome UAs also contain "Safari".
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${device} · ${browser}`;
}

function deviceKind(
  standalone: boolean | null,
  endpoint: string,
  userAgent: string | null,
): "pwa" | "web" | "unknown" {
  if (standalone === true) return "pwa";
  if (standalone === false) return "web";
  // Pre-tracking rows: iOS only supports web push from an installed
  // home-screen app, so an Apple endpoint + iPhone/iPad UA must be a PWA.
  if (
    endpointHost(endpoint) === "web.push.apple.com" &&
    userAgent &&
    /iPhone|iPad/.test(userAgent)
  ) {
    return "pwa";
  }
  return "unknown";
}

/**
 * Sends a real end-to-end test notification to the given member: a Notification
 * row + bell event + web push to every one of their registered devices. Runs
 * the exact production pipeline, so failures land in the push delivery log.
 */
export async function sendTestNotificationToMember(memberId: string): Promise<{
  pushed: boolean;
  deviceCount: number;
}> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true },
  });
  if (!member) throw new Error("Member not found");

  const title = "Test notification";
  const body = `Sent by ${user.name || "an admin"} to check notifications reach you.`;
  const tag = `test-${member.id}`;

  await createAndPublishNotifications({
    recipientIds: [member.id],
    type: "test",
    title,
    body,
    linkUrl: "/dashboard/account",
    tag,
  });

  const deviceCount = await prisma.pushSubscription.count({
    where: { memberId: member.id },
  });
  // Await (rather than fire-and-forget) so the delivery log is written before
  // the admin panel refreshes.
  await sendPush([member.id], {
    title,
    body,
    url: "/dashboard/account",
    tag,
    type: "test",
  });

  return { pushed: isPushConfigured() && deviceCount > 0, deviceCount };
}

/**
 * Per-member push notification coverage for the admin Members page: whether
 * each member has notifications enabled from the website and/or the installed
 * PWA, with a device breakdown. "On" here means the device holds an active
 * push subscription (permission granted + subscribed).
 */
export async function getMembersNotificationStatus(): Promise<
  MemberNotificationStatus[]
> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const users = await prisma.user.findMany({
    where: { blocked: false },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      pushSubscriptions: {
        select: {
          id: true,
          endpoint: true,
          userAgent: true,
          standalone: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });
  const ids = users.map((u) => u.id);

  // Latest row per recipient: ordered + distinct keeps the first (newest) one.
  const [latestNotifications, latestDeliveries, unreadGroups] =
    await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: { in: ids } },
        orderBy: [{ recipientId: "asc" }, { createdAt: "desc" }],
        distinct: ["recipientId"],
        select: {
          recipientId: true,
          title: true,
          createdAt: true,
          read: true,
          readAt: true,
        },
      }),
      prisma.pushDeliveryLog.findMany({
        where: { recipientId: { in: ids }, ok: true },
        orderBy: [{ recipientId: "asc" }, { createdAt: "desc" }],
        distinct: ["recipientId"],
        select: { recipientId: true, createdAt: true },
      }),
      prisma.notification.groupBy({
        by: ["recipientId"],
        where: { recipientId: { in: ids }, read: false },
        _count: { _all: true },
      }),
    ]);

  const lastNotifByUser = new Map(
    latestNotifications.map((n) => [n.recipientId, n]),
  );
  const lastDeliveryByUser = new Map(
    latestDeliveries.map((d) => [d.recipientId, d.createdAt]),
  );
  const unreadByUser = new Map(
    unreadGroups.map((g) => [g.recipientId, g._count._all]),
  );

  return users.map((u) => {
    const devices = u.pushSubscriptions.map((s) => ({
      id: s.id,
      label: deviceLabel(s.userAgent),
      kind: deviceKind(s.standalone, s.endpoint, s.userAgent),
      lastActiveAt: s.updatedAt,
    }));
    const lastNotif = lastNotifByUser.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl,
      webOn: devices.some((d) => d.kind === "web" || d.kind === "unknown"),
      pwaOn: devices.some((d) => d.kind === "pwa"),
      devices,
      lastNotification: lastNotif
        ? {
            title: lastNotif.title,
            createdAt: lastNotif.createdAt,
            read: lastNotif.read,
            readAt: lastNotif.readAt,
          }
        : null,
      lastPushDeliveredAt: lastDeliveryByUser.get(u.id) ?? null,
      unreadCount: unreadByUser.get(u.id) ?? 0,
    };
  });
}
