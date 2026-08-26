import {
  NOTIFICATION_NEW,
  NOTIFICATION_READ,
  NOTIFICATION_READ_ALL,
} from "@/lib/channels";
import {
  inboxThreadIdFromLinkUrl,
  inboxThreadIdsFromReadPayload,
  threadIdFromInboxDelta,
} from "@/lib/notification-read";
import { isViewingLink } from "@/lib/notification-sound-policy";

export const CLEARED_HOLD_MS = 15_000;
export const MAX_BELL_ITEMS = 30;
export const MAX_SEEN_IDS = 200;

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  tag: string | null;
  read: boolean;
  createdAt: string | Date;
};

export type ThreadPreview = {
  lastMessage: string;
  lastAuthor: string;
  lastAt: string;
};

export type LastRealtimeEvent = {
  type: string;
  at: number;
  summary: string;
};

export type LastSoundDecision = {
  played: boolean;
  reason: string;
  at: number;
  linkUrl?: string | null;
};

export type NotificationRealtimeState = {
  notificationUnread: number;
  inboxUnread: number;
  threadUnread: Record<string, number>;
  threadPreviews: Record<string, ThreadPreview>;
  items: NotificationItem[];
  lastEvent: LastRealtimeEvent | null;
  lastSound: LastSoundDecision | null;
  seenNotificationIds: string[];
  recentlyCleared: Record<string, number>;
  lastInboxThreadId: string | null;
  inboxResync: number;
};

export const initialNotificationRealtimeState: NotificationRealtimeState = {
  notificationUnread: 0,
  inboxUnread: 0,
  threadUnread: {},
  threadPreviews: {},
  items: [],
  lastEvent: null,
  lastSound: null,
  seenNotificationIds: [],
  recentlyCleared: {},
  lastInboxThreadId: null,
  inboxResync: 0,
};

export type RealtimeApplyContext = {
  currentUserId?: string;
  pathname: string;
  now?: number;
};

type NotificationNewPayload = {
  type?: string;
  authorId?: string;
  notification?: NotificationItem | null;
};

type ReadPayload = {
  type?: string;
  ids?: string[];
  tags?: string[];
  linkUrls?: string[];
  unread?: number;
  inboxUnread?: number;
};

type InboxPayload = {
  type?: string;
  threadId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  authorId?: string;
  lastAuthor?: string;
  lastMessage?: string;
  lastAt?: string;
};

function rememberSeen(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids;
  const next = [...ids, id];
  return next.length > MAX_SEEN_IDS ? next.slice(-MAX_SEEN_IDS) : next;
}

function event(type: string, summary: string, now: number): LastRealtimeEvent {
  return { type, at: now, summary };
}

function isViewingThread(pathname: string, threadId: string | null): boolean {
  if (!threadId) return false;
  return isViewingLink(pathname, `/dashboard/messages/${threadId}`);
}

function isSelf(ctx: RealtimeApplyContext, authorId?: string): boolean {
  return Boolean(ctx.currentUserId && authorId && ctx.currentUserId === authorId);
}

function wasRecentlyCleared(
  state: NotificationRealtimeState,
  threadId: string,
  now: number,
): boolean {
  const at = state.recentlyCleared[threadId];
  return typeof at === "number" && now - at < CLEARED_HOLD_MS;
}

function bumpUnread(
  state: NotificationRealtimeState,
  threadId: string | null,
): NotificationRealtimeState {
  if (!threadId) {
    return {
      ...state,
      inboxUnread: state.inboxUnread + 1,
    };
  }
  return {
    ...state,
    inboxUnread: state.inboxUnread + 1,
    threadUnread: {
      ...state.threadUnread,
      [threadId]: (state.threadUnread[threadId] ?? 0) + 1,
    },
  };
}

function applyNotificationNew(
  state: NotificationRealtimeState,
  payload: NotificationNewPayload,
  ctx: RealtimeApplyContext,
  now: number,
): NotificationRealtimeState {
  const incoming = payload.notification;
  if (!incoming?.id) {
    return {
      ...state,
      lastEvent: event(NOTIFICATION_NEW, "ignored (no row)", now),
    };
  }
  if (state.seenNotificationIds.includes(incoming.id)) {
    return {
      ...state,
      lastEvent: event(NOTIFICATION_NEW, `duplicate ${incoming.id}`, now),
    };
  }
  if (state.items.some((x) => x.id === incoming.id)) {
    return {
      ...state,
      seenNotificationIds: rememberSeen(state.seenNotificationIds, incoming.id),
      lastEvent: event(NOTIFICATION_NEW, `already had ${incoming.id}`, now),
    };
  }

  const threadId = inboxThreadIdFromLinkUrl(incoming.linkUrl);
  const viewing = Boolean(
    incoming.linkUrl && isViewingLink(ctx.pathname, incoming.linkUrl),
  );
  const self = isSelf(ctx, payload.authorId);
  const item = viewing || self ? { ...incoming, read: true } : incoming;

  let next: NotificationRealtimeState = {
    ...state,
    items: [item, ...state.items].slice(0, MAX_BELL_ITEMS),
    seenNotificationIds: rememberSeen(state.seenNotificationIds, incoming.id),
    lastEvent: event(
      NOTIFICATION_NEW,
      viewing
        ? `open-thread ${threadId ?? incoming.id}`
        : self
          ? `self ${incoming.id}`
          : incoming.id,
      now,
    ),
  };

  // Open thread / own messages: the row still exists on the server (until
  // mark-read), but the current tab must not flash the bell. Inbox pills are
  // owned by `inbox` events (message counts), so a paired notification.new
  // must not double-count.
  if (!viewing && !self) {
    next = {
      ...next,
      notificationUnread: next.notificationUnread + 1,
    };
  }

  return next;
}

function applyRead(
  state: NotificationRealtimeState,
  payload: ReadPayload,
  now: number,
): NotificationRealtimeState {
  const ids = new Set(payload.ids ?? []);
  const urls = new Set(payload.linkUrls ?? []);
  const threadIds = inboxThreadIdsFromReadPayload({
    tags: payload.tags,
    linkUrls: payload.linkUrls,
  });
  const items = state.items.map((x) =>
    ids.has(x.id) || (x.linkUrl && urls.has(x.linkUrl)) ? { ...x, read: true } : x,
  );
  const threadUnread = { ...state.threadUnread };
  const recentlyCleared = { ...state.recentlyCleared };
  for (const id of threadIds) {
    threadUnread[id] = 0;
    recentlyCleared[id] = now;
  }
  return {
    ...state,
    items,
    threadUnread,
    recentlyCleared,
    notificationUnread:
      typeof payload.unread === "number"
        ? Math.max(0, payload.unread)
        : state.notificationUnread,
    inboxUnread:
      typeof payload.inboxUnread === "number"
        ? Math.max(0, payload.inboxUnread)
        : state.inboxUnread,
    lastEvent: event(
      NOTIFICATION_READ,
      threadIds.join(",") || `${ids.size} ids`,
      now,
    ),
  };
}

function applyReadAll(
  state: NotificationRealtimeState,
  payload: ReadPayload,
  now: number,
): NotificationRealtimeState {
  return {
    ...state,
    items: state.items.map((x) => (x.read ? x : { ...x, read: true })),
    notificationUnread:
      typeof payload.unread === "number" ? Math.max(0, payload.unread) : 0,
    inboxUnread:
      typeof payload.inboxUnread === "number"
        ? Math.max(0, payload.inboxUnread)
        : state.inboxUnread,
    lastEvent: event(NOTIFICATION_READ_ALL, "cleared", now),
  };
}

function applyInbox(
  state: NotificationRealtimeState,
  payload: InboxPayload,
  ctx: RealtimeApplyContext,
  now: number,
): NotificationRealtimeState {
  const threadId = threadIdFromInboxDelta(payload);
  if (!threadId) {
    return {
      ...state,
      lastEvent: event("inbox", "ignored (no thread)", now),
    };
  }

  const prevPreview = state.threadPreviews[threadId];
  const lastMessage =
    payload.lastMessage ?? prevPreview?.lastMessage ?? "";
  const lastAuthor = payload.lastAuthor ?? prevPreview?.lastAuthor ?? "";
  const lastAt =
    payload.lastAt ?? prevPreview?.lastAt ?? new Date(now).toISOString();
  const duplicatePreview =
    Boolean(prevPreview) &&
    prevPreview.lastAt === lastAt &&
    prevPreview.lastMessage === lastMessage;

  const threadPreviews = {
    ...state.threadPreviews,
    [threadId]: { lastMessage, lastAuthor, lastAt },
  };

  const inboxThread =
    threadId.startsWith("conv-") || threadId.startsWith("project-");
  const shouldBump =
    inboxThread &&
    !isSelf(ctx, payload.authorId) &&
    !isViewingThread(ctx.pathname, threadId) &&
    !wasRecentlyCleared(state, threadId, now) &&
    !duplicatePreview;

  let next: NotificationRealtimeState = {
    ...state,
    threadPreviews,
    lastInboxThreadId: threadId,
    lastEvent: event(
      "inbox",
      isSelf(ctx, payload.authorId)
        ? `self ${threadId}`
        : isViewingThread(ctx.pathname, threadId)
          ? `open ${threadId}`
          : threadId,
      now,
    ),
  };
  if (shouldBump) next = bumpUnread(next, threadId);
  return next;
}

export function applyRealtimeEvent(
  state: NotificationRealtimeState,
  data: unknown,
  ctx: RealtimeApplyContext,
): NotificationRealtimeState {
  const now = ctx.now ?? Date.now();
  const payload = data as
    | (NotificationNewPayload & ReadPayload & InboxPayload)
    | null;
  if (!payload || typeof payload !== "object" || !payload.type) return state;

  if (payload.type === NOTIFICATION_NEW) {
    return applyNotificationNew(state, payload, ctx, now);
  }
  if (payload.type === NOTIFICATION_READ) {
    return applyRead(state, payload, now);
  }
  if (payload.type === NOTIFICATION_READ_ALL) {
    return applyReadAll(state, payload, now);
  }
  if (payload.type === "inbox") {
    return applyInbox(state, payload, ctx, now);
  }
  return state;
}

export function clearThreadUnreadState(
  state: NotificationRealtimeState,
  threadId: string,
  now = Date.now(),
): NotificationRealtimeState {
  const prev = state.threadUnread[threadId] ?? 0;
  const matching = state.items.filter(
    (n) => !n.read && inboxThreadIdFromLinkUrl(n.linkUrl) === threadId,
  );
  return {
    ...state,
    threadUnread: { ...state.threadUnread, [threadId]: 0 },
    recentlyCleared: { ...state.recentlyCleared, [threadId]: now },
    inboxUnread: Math.max(0, state.inboxUnread - prev),
    notificationUnread: Math.max(0, state.notificationUnread - matching.length),
    items: state.items.map((n) =>
      inboxThreadIdFromLinkUrl(n.linkUrl) === threadId ? { ...n, read: true } : n,
    ),
    lastEvent: event("local.read", threadId, now),
  };
}

export function hydrateInboxThreadsState(
  state: NotificationRealtimeState,
  threads: {
    id: string;
    unread: number;
    lastMessage: string;
    lastAuthor: string;
    lastAt: string;
  }[],
  activeThreadId: string | null,
  now = Date.now(),
): NotificationRealtimeState {
  const threadUnread = { ...state.threadUnread };
  const threadPreviews = { ...state.threadPreviews };
  for (const t of threads) {
    if (t.id === activeThreadId || wasRecentlyCleared(state, t.id, now)) {
      threadUnread[t.id] = 0;
    } else if (threadUnread[t.id] === undefined) {
      threadUnread[t.id] = Math.max(0, t.unread);
    }
    if (!threadPreviews[t.id] && t.lastAt) {
      threadPreviews[t.id] = {
        lastMessage: t.lastMessage,
        lastAuthor: t.lastAuthor,
        lastAt: t.lastAt,
      };
    }
  }
  return { ...state, threadUnread, threadPreviews };
}

export function replaceInboxThreadsState(
  state: NotificationRealtimeState,
  threads: {
    id: string;
    unread: number;
    lastMessage: string;
    lastAuthor: string;
    lastAt: string;
  }[],
  activeThreadId: string | null,
  now = Date.now(),
): NotificationRealtimeState {
  const threadUnread: Record<string, number> = { ...state.threadUnread };
  const threadPreviews = { ...state.threadPreviews };
  for (const t of threads) {
    if (t.id === activeThreadId || wasRecentlyCleared(state, t.id, now)) {
      threadUnread[t.id] = 0;
    } else {
      threadUnread[t.id] = Math.max(0, t.unread);
    }
    threadPreviews[t.id] = {
      lastMessage: t.lastMessage,
      lastAuthor: t.lastAuthor,
      lastAt: t.lastAt,
    };
  }
  return { ...state, threadUnread, threadPreviews };
}

export function markItemsReadState(
  state: NotificationRealtimeState,
  predicate: (n: NotificationItem) => boolean,
): NotificationRealtimeState {
  let dropped = 0;
  const items = state.items.map((n) => {
    if (!n.read && predicate(n)) {
      dropped += 1;
      return { ...n, read: true };
    }
    return n;
  });
  if (dropped === 0) return state;
  return {
    ...state,
    items,
    notificationUnread: Math.max(0, state.notificationUnread - dropped),
  };
}
