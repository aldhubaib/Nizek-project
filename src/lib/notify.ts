import "server-only";
import { prisma } from "@/lib/prisma";
import { batchPublish } from "@/lib/centrifugo";
import { userChannel, NOTIFICATION_NEW } from "@/lib/channels";
import {
  filterRecipientsByPreferences,
  type PreferenceFlags,
} from "@/lib/notification-prefs";
import { enqueuePush } from "@/lib/push-queue";
import type { PushPayload } from "@/lib/push-core";

type NotifyInput = {
  recipientIds: string[];
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Web-push tag (thread-scoped) — stored on the row for cross-device banner dismissal. */
  tag?: string | null;
  /** Thread identity ("task-{id}" | "conv-{id}" | "project-{id}") for mute filtering. */
  threadKey?: string | null;
};

export type CreatedNotification = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  tag: string | null;
  read: boolean;
  createdAt: Date;
};

/**
 * Loads stored preferences + thread mutes and returns only the recipients who
 * should be notified. Callers MUST use this filtered list for push too, so a
 * muted user gets no row, no push, and no chime anywhere.
 */
export async function resolveNotifiableRecipients(input: {
  recipientIds: string[];
  type: string;
  threadKey?: string | null;
}): Promise<string[]> {
  const unique = [...new Set(input.recipientIds)].filter(Boolean);
  if (unique.length === 0) return [];

  try {
    const [prefRows, muteRows] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId: { in: unique } },
      }),
      input.threadKey
        ? prisma.mutedThread.findMany({
            where: { userId: { in: unique }, threadKey: input.threadKey },
            select: { userId: true, threadKey: true },
          })
        : Promise.resolve([]),
    ]);

    const prefsByUser = new Map<string, PreferenceFlags>(
      prefRows.map((p) => [
        p.userId,
        {
          notifyMessages: p.notifyMessages,
          notifyMentions: p.notifyMentions,
          notifyRejections: p.notifyRejections,
          notifyDeadlines: p.notifyDeadlines,
          soundEnabled: p.soundEnabled,
        },
      ]),
    );
    const mutedPairs = new Set(
      muteRows.map((m) => `${m.userId}:${m.threadKey}`),
    );

    return filterRecipientsByPreferences({
      recipientIds: unique,
      type: input.type,
      threadKey: input.threadKey,
      prefsByUser,
      mutedPairs,
    });
  } catch (err) {
    // Preferences are an opt-out layer; never let a lookup failure block delivery.
    console.error(
      "[notify] preference lookup failed — notifying all recipients:",
      err instanceof Error ? err.message : err,
    );
    return unique;
  }
}

/**
 * Create Notification rows for the given recipients (after preference/mute
 * filtering) and publish a per-recipient `notification.new` event on each
 * user's Centrifugo channel carrying the full row, so the bell prepends it
 * live without a refetch. Returns the created rows — callers should push to
 * `rows.map((r) => r.recipientId)` so push honors the same filtering.
 */
export async function createAndPublishNotifications(
  input: NotifyInput,
): Promise<CreatedNotification[]> {
  const recipients = await resolveNotifiableRecipients({
    recipientIds: input.recipientIds,
    type: input.type,
    threadKey: input.threadKey,
  });
  if (recipients.length === 0) return [];

  const rows = await prisma.notification.createManyAndReturn({
    data: recipients.map((rid) => ({
      recipientId: rid,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
      tag: input.tag ?? null,
    })),
  });

  // Each recipient gets a distinct row/id — batch all publishes into one
  // Centrifugo HTTP request instead of N individual calls.
  void batchPublish(
    rows.map((n) => ({
      channel: userChannel(n.recipientId),
      data: {
        type: NOTIFICATION_NEW,
        notification: {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          linkUrl: n.linkUrl,
          tag: n.tag,
          read: n.read,
          createdAt: n.createdAt,
        },
      },
    })),
  );

  return rows;
}

/**
 * Create notification rows, broadcast to Centrifugo, AND enqueue push delivery
 * to the background worker — all in one call. This is the primary entry point
 * for production notification triggers (messages, mentions, rejections, etc.).
 */
export async function notifyAndPush(
  input: NotifyInput,
  pushPayload: Omit<PushPayload, "tag" | "type"> & { type: string },
): Promise<CreatedNotification[]> {
  const rows = await createAndPublishNotifications(input);
  if (rows.length > 0) {
    void enqueuePush(
      rows.map((r) => r.recipientId),
      { ...pushPayload, tag: input.tag ?? undefined },
    );
  }
  return rows;
}

/** Fresh unread count for a recipient (used to sync read-state across devices). */
export async function unreadCountFor(recipientId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId, read: false },
  });
}

/** Bell badge + inbox-nav badge after a read, so clients can update without a refetch. */
export async function unreadCountsFor(recipientId: string): Promise<{
  unread: number;
  inboxUnread: number;
}> {
  const [unread, inboxUnread] = await Promise.all([
    prisma.notification.count({
      where: { recipientId, read: false },
    }),
    prisma.notification.count({
      where: {
        recipientId,
        read: false,
        linkUrl: { startsWith: "/dashboard/messages/" },
      },
    }),
  ]);
  return { unread, inboxUnread };
}
