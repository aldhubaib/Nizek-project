import "server-only";
import { prisma } from "@/lib/prisma";
import { batchPublish } from "@/lib/centrifugo";
import { userChannel, NOTIFICATION_NEW } from "@/lib/channels";
import {
  filterRecipientsByPreferences,
  isThreadNotificationLevel,
  type PreferenceFlags,
  type ThreadNotificationLevel,
} from "@/lib/notification-prefs";
import { dispatchOutbox, writePushOutbox } from "@/lib/push-queue";
import type { PushPayload } from "@/lib/push-core";
import { sumInboxMessageUnreads } from "@/lib/inbox-unread";

type NotifyInput = {
  recipientIds: string[];
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Web-push tag (thread-scoped) — stored on the row for cross-device banner dismissal. */
  tag?: string | null;
  /** Thread identity ("task-{id}" | "conv-{id}" | "project-{id}") for level filtering. */
  threadKey?: string | null;
  /**
   * Who the message names (@mention, @all, reply target). Recipients whose
   * level for the thread is "mentions" are notified only if listed here.
   */
  mentionedIds?: string[] | null;
  /** Message author — forwarded on `notification.new` so clients can skip self-chimes. */
  authorId?: string | null;
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

/** Stored per-thread levels for these users (absent = thread default). */
export async function loadThreadLevels(
  userIds: string[],
  threadKey: string,
): Promise<Map<string, ThreadNotificationLevel>> {
  const rows = await prisma.threadNotificationPref.findMany({
    where: { userId: { in: userIds }, threadKey },
    select: { userId: true, level: true },
  });
  const map = new Map<string, ThreadNotificationLevel>();
  for (const r of rows) if (isThreadNotificationLevel(r.level)) map.set(r.userId, r.level);
  return map;
}

/**
 * Returns only the recipients who should be notified. Callers MUST use this
 * filtered list for push too, so a person at level "none" gets no row, no
 * push, and no chime anywhere.
 *
 * Notifications are mandatory: the per-type opt-outs that used to live in
 * NotificationPreference (messages / mentions / declines / deadlines) are no
 * longer consulted, so every type is delivered to everyone regardless of any
 * value still stored from the removed settings UI. The per-thread level
 * (all / mentions / none) is the one opt-out.
 */
export async function resolveNotifiableRecipients(input: {
  recipientIds: string[];
  type: string;
  threadKey?: string | null;
  mentionedIds?: string[] | null;
}): Promise<string[]> {
  const unique = [...new Set(input.recipientIds)].filter(Boolean);
  if (unique.length === 0) return [];
  if (!input.threadKey) return unique;

  try {
    const levelsByUser = await loadThreadLevels(unique, input.threadKey);
    return filterRecipientsByPreferences({
      recipientIds: unique,
      type: input.type,
      threadKey: input.threadKey,
      // Empty map => everyone gets DEFAULT_PREFERENCES (all types on).
      prefsByUser: new Map<string, PreferenceFlags>(),
      levelsByUser,
      mentionedIds: input.mentionedIds ?? [],
    });
  } catch (err) {
    // Levels are an opt-out layer; never let a lookup failure block delivery
    // of what the thread default would send.
    console.error(
      "[notify] level lookup failed — using thread defaults:",
      err instanceof Error ? err.message : err,
    );
    return filterRecipientsByPreferences({
      recipientIds: unique,
      type: input.type,
      threadKey: input.threadKey,
      prefsByUser: new Map<string, PreferenceFlags>(),
      mentionedIds: input.mentionedIds ?? [],
    });
  }
}

type PushGroup = { recipientIds: string[]; payload: PushPayload };

/**
 * Creates the Notification rows and, when `buildPush` is given, the PushOutbox
 * rows in ONE transaction, so a notification can never exist without its push
 * (or a push without its notification). Publishes the bell events and hands
 * the outbox to the queue only after commit.
 */
async function createNotifications(
  input: NotifyInput,
  buildPush?: (rows: CreatedNotification[]) => PushGroup[],
): Promise<CreatedNotification[]> {
  const recipients = await resolveNotifiableRecipients({
    recipientIds: input.recipientIds,
    type: input.type,
    threadKey: input.threadKey,
    mentionedIds: input.mentionedIds,
  });
  if (recipients.length === 0) return [];

  const { rows, outbox } = await prisma.$transaction(async (tx) => {
    const rows = await tx.notification.createManyAndReturn({
      data: recipients.map((rid) => ({
        recipientId: rid,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
        tag: input.tag ?? null,
      })),
    });

    const groups = buildPush ? buildPush(rows) : [];
    const outbox = await Promise.all(
      groups.map((g) => writePushOutbox(tx, g.recipientIds, g.payload)),
    );
    return { rows, outbox };
  });

  // Each recipient gets a distinct row/id — batch all publishes into one
  // Centrifugo HTTP request instead of N individual calls.
  void batchPublish(
    rows.map((n) => ({
      channel: userChannel(n.recipientId),
      data: {
        type: NOTIFICATION_NEW,
        authorId: input.authorId ?? undefined,
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

  // After commit. If Redis is down this logs and returns; the worker's outbox
  // sweep delivers the push once the queue is reachable again.
  if (outbox.length > 0) void dispatchOutbox(outbox);

  return rows;
}

/**
 * Create Notification rows for the given recipients (after mute filtering) and
 * publish a per-recipient `notification.new` event on each user's Centrifugo
 * channel carrying the full row, so the bell prepends it live without a
 * refetch. No push — use notifyAndPush for that.
 */
export async function createAndPublishNotifications(
  input: NotifyInput,
): Promise<CreatedNotification[]> {
  return createNotifications(input);
}

/**
 * Create notification rows, broadcast to Centrifugo, AND durably record push
 * delivery for the background worker — all in one call. This is the primary
 * entry point for production notification triggers (messages, mentions,
 * rejections, etc.).
 */
export async function notifyAndPush(
  input: NotifyInput,
  pushPayload: Omit<PushPayload, "tag" | "type"> & { type: string },
): Promise<CreatedNotification[]> {
  const tag = input.tag ?? undefined;
  return createNotifications(input, (rows) => [
    { recipientIds: rows.map((r) => r.recipientId), payload: { ...pushPayload, tag } },
  ]);
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
    sumInboxMessageUnreads(recipientId),
  ]);
  return { unread, inboxUnread };
}
