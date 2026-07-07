"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

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

export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id, recipientId: user.id },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true },
  });
}
