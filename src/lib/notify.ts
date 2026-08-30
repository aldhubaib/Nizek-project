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
import { sumInboxMessageUnreads } from "@/lib/inbox-unread";
import { getAliasMap, maskPlainNames, NO_MASK, type AliasIdentity } from "@/lib/alias";
import { clientViewerIds } from "@/lib/client-role";

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
  /** Message author — forwarded on `notification.new` so clients can skip self-chimes. */
  authorId?: string | null;
  /**
   * Render a second, aliased copy of `title`/`body` for any client recipient.
   * Titles are stored pre-rendered, so this has to happen at write time — it is
   * the only way to keep the stored row, the bell payload, and the push banner
   * telling a client the same story.
   */
  alias?: {
    projectId: string | null;
    /** Whose face the push banner shows; swapped for their alias photo. */
    actorUserId?: string | null;
  } | null;
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
/**
 * Which of these recipients are clients, plus the alias map to render for them.
 * Returns an empty set when there is nothing to mask, so the common all-staff
 * case costs no extra queries.
 */
async function resolveAliasAudience(
  input: NotifyInput,
  recipients: string[],
): Promise<{ clientIds: Set<string>; aliasMap: Map<string, AliasIdentity> }> {
  if (!input.alias?.projectId) {
    return { clientIds: new Set(), aliasMap: NO_MASK };
  }
  const aliasMap = await getAliasMap(input.alias.projectId);
  if (aliasMap.size === 0) {
    return { clientIds: new Set(), aliasMap: NO_MASK };
  }
  return {
    clientIds: await clientViewerIds(recipients, input.alias.projectId),
    aliasMap,
  };
}

export async function createAndPublishNotifications(
  input: NotifyInput,
): Promise<CreatedNotification[]> {
  const recipients = await resolveNotifiableRecipients({
    recipientIds: input.recipientIds,
    type: input.type,
    threadKey: input.threadKey,
  });
  if (recipients.length === 0) return [];

  const { clientIds, aliasMap } = await resolveAliasAudience(input, recipients);

  const rows = await prisma.notification.createManyAndReturn({
    data: recipients.map((rid) => {
      const mask = clientIds.has(rid);
      return {
        recipientId: rid,
        type: input.type,
        title: mask ? maskPlainNames(input.title, aliasMap) : input.title,
        body: mask
          ? maskPlainNames(input.body ?? "", aliasMap) || null
          : (input.body ?? null),
        linkUrl: input.linkUrl ?? null,
        tag: input.tag ?? null,
      };
    }),
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
  if (rows.length === 0) return rows;

  const tag = input.tag ?? undefined;

  if (!input.alias?.projectId) {
    void enqueuePush(
      rows.map((r) => r.recipientId),
      { ...pushPayload, tag },
    );
    return rows;
  }

  // Rows already carry the audience-correct title and body, so grouping by them
  // keeps each banner consistent with the stored notification. Clients also get
  // the actor's alias photo rather than their real face.
  const [clientIds, aliasMap] = await Promise.all([
    clientViewerIds(
      rows.map((r) => r.recipientId),
      input.alias.projectId,
    ),
    getAliasMap(input.alias.projectId),
  ]);
  const actorAlias = input.alias.actorUserId
    ? aliasMap.get(input.alias.actorUserId)
    : undefined;
  // An aliased actor's real avatar must never reach a client banner, so an alias
  // with no photo drops the icon entirely rather than falling back — the service
  // worker then shows the app icon.
  const clientIcon = actorAlias
    ? (actorAlias.imageUrl ?? undefined)
    : pushPayload.icon;

  const groups = new Map<
    string,
    { title: string; body?: string; icon?: string; ids: string[] }
  >();
  for (const row of rows) {
    const forClient = clientIds.has(row.recipientId);
    const icon = forClient ? clientIcon : pushPayload.icon;
    const key = `${forClient ? "c" : "s"}\u0000${row.title}\u0000${row.body ?? ""}`;
    const group = groups.get(key) ?? {
      title: row.title,
      body: row.body ?? undefined,
      icon: icon ?? undefined,
      ids: [],
    };
    group.ids.push(row.recipientId);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    void enqueuePush(group.ids, {
      ...pushPayload,
      title: group.title,
      body: group.body,
      icon: group.icon,
      tag,
    });
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
    sumInboxMessageUnreads(recipientId),
  ]);
  return { unread, inboxUnread };
}
