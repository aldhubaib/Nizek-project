import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_NEW,
  NOTIFICATION_READ,
  NOTIFICATION_READ_ALL,
} from "@/lib/channels";
import {
  applyRealtimeEvent,
  clearThreadUnreadState,
  hydrateInboxThreadsState,
  initialNotificationRealtimeState,
  type NotificationItem,
  type NotificationRealtimeState,
} from "@/lib/notification-realtime-state";

const ctx = {
  currentUserId: "me",
  pathname: "/dashboard",
  now: 1_000_000,
};

function notif(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type: "message",
    title: "Hello",
    body: "hi",
    linkUrl: "/dashboard/messages/conv-1",
    tag: "thread-conv-1",
    read: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function apply(
  state: NotificationRealtimeState,
  data: unknown,
  extra: Partial<typeof ctx> = {},
) {
  return applyRealtimeEvent(state, data, { ...ctx, ...extra });
}

describe("applyRealtimeEvent", () => {
  it("increments the bell on notification.new without touching inbox pills", () => {
    const next = apply(initialNotificationRealtimeState, {
      type: NOTIFICATION_NEW,
      authorId: "other",
      notification: notif(),
    });
    expect(next.notificationUnread).toBe(1);
    expect(next.inboxUnread).toBe(0);
    expect(next.threadUnread["conv-1"]).toBeUndefined();
    expect(next.items[0].id).toBe("n1");
  });

  it("increments inbox + thread unread on inbox events", () => {
    const next = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      conversationId: "1",
      authorId: "other",
      lastAuthor: "Sam",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    expect(next.inboxUnread).toBe(1);
    expect(next.threadUnread["conv-1"]).toBe(1);
    expect(next.threadPreviews["conv-1"].lastMessage).toBe("yo");
  });

  it("does not double-count a replayed notification.new", () => {
    const first = apply(initialNotificationRealtimeState, {
      type: NOTIFICATION_NEW,
      notification: notif(),
    });
    const second = apply(first, {
      type: NOTIFICATION_NEW,
      notification: notif(),
    });
    expect(second.notificationUnread).toBe(1);
    expect(second.inboxUnread).toBe(0);
    expect(second.items).toHaveLength(1);
  });

  it("does not double-increment when inbox arrives with the same thread", () => {
    const afterNew = apply(initialNotificationRealtimeState, {
      type: NOTIFICATION_NEW,
      notification: notif(),
    });
    const afterInbox = apply(afterNew, {
      type: "inbox",
      threadId: "conv-1",
      conversationId: "1",
      authorId: "other",
      lastAuthor: "Sam",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    expect(afterInbox.inboxUnread).toBe(1);
    expect(afterInbox.threadUnread["conv-1"]).toBe(1);
    expect(afterInbox.threadPreviews["conv-1"].lastMessage).toBe("yo");
  });

  it("still increments once when inbox arrives before notification.new", () => {
    const afterInbox = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    const afterNew = apply(afterInbox, {
      type: NOTIFICATION_NEW,
      notification: notif(),
    });
    expect(afterNew.inboxUnread).toBe(1);
    expect(afterNew.threadUnread["conv-1"]).toBe(1);
    expect(afterNew.notificationUnread).toBe(1);
  });

  it("does not double-count a replayed inbox event for the same preview", () => {
    const payload = {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastAuthor: "Sam",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    };
    const first = apply(initialNotificationRealtimeState, payload);
    const second = apply(first, payload);
    expect(second.inboxUnread).toBe(1);
    expect(second.threadUnread["conv-1"]).toBe(1);
  });

  it("inbox-only (muted) still shows an unread count", () => {
    const next = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastAuthor: "Sam",
      lastMessage: "muted still live",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    expect(next.inboxUnread).toBe(1);
    expect(next.threadUnread["conv-1"]).toBe(1);
    expect(next.threadPreviews["conv-1"].lastMessage).toBe("muted still live");
  });

  it("skips unread for the currently open thread", () => {
    const next = apply(
      initialNotificationRealtimeState,
      { type: NOTIFICATION_NEW, notification: notif() },
      { pathname: "/dashboard/messages/conv-1" },
    );
    expect(next.notificationUnread).toBe(0);
    expect(next.inboxUnread).toBe(0);
    expect(next.threadUnread["conv-1"]).toBeUndefined();
    expect(next.items).toHaveLength(1);
    expect(next.items[0].read).toBe(true);
  });

  it("skips inbox unread while the thread is open", () => {
    const next = apply(
      initialNotificationRealtimeState,
      {
        type: "inbox",
        threadId: "conv-1",
        authorId: "other",
        lastMessage: "yo",
        lastAt: "2026-01-01T00:00:01.000Z",
      },
      { pathname: "/dashboard/messages/conv-1" },
    );
    expect(next.inboxUnread).toBe(0);
    expect(next.threadUnread["conv-1"]).toBeUndefined();
    expect(next.threadPreviews["conv-1"].lastMessage).toBe("yo");
  });

  it("skips unread for self-authored notification.new", () => {
    const next = apply(initialNotificationRealtimeState, {
      type: NOTIFICATION_NEW,
      authorId: "me",
      notification: notif(),
    });
    expect(next.notificationUnread).toBe(0);
    expect(next.inboxUnread).toBe(0);
    expect(next.items[0].read).toBe(true);
  });

  it("skips unread for self-authored inbox events", () => {
    const next = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "me",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    expect(next.inboxUnread).toBe(0);
    expect(next.threadUnread["conv-1"]).toBeUndefined();
  });

  it("notification.read zeros matching thread badges from server counts", () => {
    const seeded = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    const next = apply(seeded, {
      type: NOTIFICATION_READ,
      ids: ["n1"],
      tags: ["thread-conv-1"],
      linkUrls: ["/dashboard/messages/conv-1"],
      unread: 2,
      inboxUnread: 1,
    });
    expect(next.threadUnread["conv-1"]).toBe(0);
    expect(next.notificationUnread).toBe(2);
    expect(next.inboxUnread).toBe(1);
  });

  it("notification.read-all clears the bell without wiping chat unread", () => {
    const seeded = apply(initialNotificationRealtimeState, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    const next = apply(seeded, { type: NOTIFICATION_READ_ALL, unread: 0, inboxUnread: 1 });
    expect(next.notificationUnread).toBe(0);
    expect(next.inboxUnread).toBe(1);
    expect(next.threadUnread["conv-1"]).toBe(1);
  });
});

describe("clearThreadUnreadState", () => {
  it("clears instantly and holds against a stale hydrate", () => {
    const withNotif = apply(initialNotificationRealtimeState, {
      type: NOTIFICATION_NEW,
      notification: notif(),
    });
    const seeded = apply(withNotif, {
      type: "inbox",
      threadId: "conv-1",
      authorId: "other",
      lastMessage: "yo",
      lastAt: "2026-01-01T00:00:01.000Z",
    });
    const cleared = clearThreadUnreadState(seeded, "conv-1", ctx.now);
    expect(cleared.threadUnread["conv-1"]).toBe(0);
    expect(cleared.inboxUnread).toBe(0);
    expect(cleared.notificationUnread).toBe(0);

    const hydrated = hydrateInboxThreadsState(
      cleared,
      [{ id: "conv-1", unread: 4, lastMessage: "x", lastAuthor: "y", lastAt: "t" }],
      null,
      ctx.now + 1000,
    );
    expect(hydrated.threadUnread["conv-1"]).toBe(0);
  });
});
