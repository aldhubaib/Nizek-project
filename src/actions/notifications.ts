"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publish, userChannel } from "@/lib/centrifugo";
import { NOTIFICATION_READ, NOTIFICATION_READ_ALL } from "@/lib/channels";
import { unreadCountsFor } from "@/lib/notify";
import { sumInboxMessageUnreads } from "@/lib/inbox-unread";

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  tag: string | null;
  read: boolean;
  createdAt: Date;
};

export async function getNotifications(limit = 30): Promise<NotificationDTO[]> {
  const user = await requireUser();
  return prisma.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount(): Promise<number> {
  const user = await requireUser();
  return prisma.notification.count({
    where: { recipientId: user.id, read: false },
  });
}

export async function markNotificationRead(id: string): Promise<number> {
  const user = await requireUser();
  const row = await prisma.notification.findFirst({
    where: { id, recipientId: user.id },
    select: { tag: true, read: true, linkUrl: true },
  });
  const res = await prisma.notification.updateMany({
    where: { id, recipientId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  const { unread, inboxUnread } = await unreadCountsFor(user.id);
  // Sync read-state to every other device/tab this user has open. Tags let
  // open clients close the matching OS banner (cross-device dismissal).
  if (res.count > 0) {
    void publish(userChannel(user.id), {
      type: NOTIFICATION_READ,
      ids: [id],
      tags: row?.tag ? [row.tag] : [],
      linkUrls: row?.linkUrl ? [row.linkUrl] : [],
      unread,
      inboxUnread,
    });
  }
  return unread;
}

export async function markAllNotificationsRead(): Promise<number> {
  const user = await requireUser();
  const unreadRows = await prisma.notification.findMany({
    where: { recipientId: user.id, read: false },
    select: { tag: true, linkUrl: true },
  });
  await prisma.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  const tags = [
    ...new Set(unreadRows.map((r) => r.tag).filter((t): t is string => !!t)),
  ];
  const linkUrls = [
    ...new Set(
      unreadRows.map((r) => r.linkUrl).filter((u): u is string => !!u),
    ),
  ];
  const inboxUnread = await sumInboxMessageUnreads(user.id);
  void publish(userChannel(user.id), {
    type: NOTIFICATION_READ_ALL,
    tags,
    linkUrls,
    unread: 0,
    inboxUnread,
  });
  return 0;
}
