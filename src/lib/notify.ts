import "server-only";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/centrifugo";
import { userChannel, NOTIFICATION_NEW } from "@/lib/channels";

type NotifyInput = {
  recipientIds: string[];
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
};

export type CreatedNotification = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  createdAt: Date;
};

/**
 * Create Notification rows for the given recipients and publish a per-recipient
 * `notification.new` event on each user's Centrifugo channel carrying the full
 * row, so the bell prepends it live without a refetch. De-dupes recipients and
 * is a no-op when there are none. Returns the created rows.
 */
export async function createAndPublishNotifications(
  input: NotifyInput,
): Promise<CreatedNotification[]> {
  const recipients = [...new Set(input.recipientIds)].filter(Boolean);
  if (recipients.length === 0) return [];

  const rows = await prisma.notification.createManyAndReturn({
    data: recipients.map((rid) => ({
      recipientId: rid,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
    })),
  });

  // Each recipient gets a distinct row/id, so publish per recipient.
  void Promise.all(
    rows.map((n) =>
      broadcast([userChannel(n.recipientId)], {
        type: NOTIFICATION_NEW,
        notification: {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          linkUrl: n.linkUrl,
          read: n.read,
          createdAt: n.createdAt,
        },
      }),
    ),
  );

  return rows;
}

/** Fresh unread count for a recipient (used to sync read-state across devices). */
export async function unreadCountFor(recipientId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId, read: false },
  });
}
