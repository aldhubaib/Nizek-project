"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publish, userChannel } from "@/lib/centrifugo";
import { NOTIFICATION_READ, NOTIFICATION_READ_ALL } from "@/lib/channels";

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
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
  const res = await prisma.notification.updateMany({
    where: { id, recipientId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  const unread = await prisma.notification.count({
    where: { recipientId: user.id, read: false },
  });
  // Sync read-state to every other device/tab this user has open.
  if (res.count > 0) {
    void publish(userChannel(user.id), {
      type: NOTIFICATION_READ,
      ids: [id],
      unread,
    });
  }
  return unread;
}

export async function markAllNotificationsRead(): Promise<number> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  void publish(userChannel(user.id), {
    type: NOTIFICATION_READ_ALL,
    unread: 0,
  });
  return 0;
}
