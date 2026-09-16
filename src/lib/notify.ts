import "server-only";
import { prisma } from "@/lib/prisma";
import { batchPublish } from "@/lib/centrifugo";
import { userChannel, NOTIFICATION_NEW } from "@/lib/channels";
import {
  filterRecipientsByPreferences,
  type PreferenceFlags,
} from "@/lib/notification-prefs";
import { dispatchOutbox, writePushOutbox } from "@/lib/push-queue";
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
 * Returns only the recipients who should be notified. Callers MUST use this
 * filtered list for push too, so a muted user gets no row, no push, and no
 * chime anywhere.
 *
 * Notifications are mandatory: the per-type opt-outs that used to live in
 * NotificationPreference (messages / mentions / declines / deadlines) are no
 * longer consulted, so every type is delivered to everyone regardless of any
 * value still stored from the removed settings UI. Per-thread mutes remain
 * the only opt-out.
 */
export async function resolveNotifiableRecipients(input: {
  recipientIds: string[];
  type: string;
  threadKey?: string | null;
}): Promise<string[]> {
  const unique = [...new Set(input.recipientIds)].filter(Boolean);
  if (unique.length === 0) return [];
  if (!input.threadKey) return unique;

  try {
    const muteRows = await prisma.mutedThread.findMany({
      where: { userId: { in: unique }, threadKey: input.threadKey },
      select: { userId: true, threadKey: true },
    });
    const mutedPairs = new Set(
      muteRows.map((m) => `${m.userId}:${m.threadKey}`),
    );

    return filterRecipientsByPreferences({
      recipientIds: unique,
      type: input.type,
      threadKey: input.threadKey,
      // Empty map => everyone gets DEFAULT_PREFERENCES (all types on).
      prefsByUser: new Map<string, PreferenceFlags>(),
      mutedPairs,
    });
  } catch (err) {
    // Mutes are an opt-out layer; never let a lookup failure block delivery.
    console.error(
      "[notify] mute lookup failed — notifying all recipients:",
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
  });
  if (recipients.length === 0) return [];

  const { clientIds, aliasMap } = await resolveAliasAudience(input, recipients);

  const { rows, outbox } = await prisma.$transaction(async (tx) => {
    const rows = await tx.notification.createManyAndReturn({
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

  if (!input.alias?.projectId) {
    return createNotifications(input, (rows) => [
      { recipientIds: rows.map((r) => r.recipientId), payload: { ...pushPayload, tag } },
    ]);
  }

  // Rows already carry the audience-correct title and body, so grouping by them
  // keeps each banner consistent with the stored notification. Clients also get
  // the actor's alias photo rather than their real face.
  const projectId = input.alias.projectId;
  const [clientIds, aliasMap] = await Promise.all([
    clientViewerIds([...new Set(input.recipientIds)], projectId),
    getAliasMap(projectId),
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

  return createNotifications(input, (rows) => {
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
    return [...groups.values()].map((g) => ({
      recipientIds: g.ids,
      payload: { ...pushPayload, title: g.title, body: g.body, icon: g.icon, tag },
    }));
  });
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
