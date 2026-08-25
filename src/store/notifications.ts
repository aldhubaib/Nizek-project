"use client";

import { create } from "zustand";
import type { InboxThread } from "@/actions/messages";
import type { NotificationDTO } from "@/actions/notifications";
import {
  applyRealtimeEvent,
  clearThreadUnreadState,
  hydrateInboxThreadsState,
  initialNotificationRealtimeState,
  markItemsReadState,
  replaceInboxThreadsState,
  type LastSoundDecision,
  type NotificationItem,
  type NotificationRealtimeState,
  type RealtimeApplyContext,
} from "@/lib/notification-realtime-state";

type NotificationStore = NotificationRealtimeState & {
  setNotificationUnread: (count: number) => void;
  setInboxUnread: (count: number) => void;
  incrementNotification: () => void;
  incrementInbox: () => void;
  setItems: (items: NotificationItem[]) => void;
  setLastSound: (decision: LastSoundDecision) => void;
  applyEvent: (data: unknown, ctx: RealtimeApplyContext) => void;
  clearThreadUnread: (threadId: string) => void;
  hydrateInboxThreads: (
    threads: InboxThread[],
    activeThreadId: string | null,
  ) => void;
  replaceInboxThreads: (
    threads: InboxThread[],
    activeThreadId: string | null,
  ) => void;
  markItemReadLocal: (id: string) => void;
  markAllReadLocal: () => void;
  requestInboxResync: () => void;
  reconcileCounts: (counts: {
    unread?: number;
    inboxUnread?: number;
  }) => void;
};

function asItems(list: NotificationDTO[] | NotificationItem[]): NotificationItem[] {
  return list.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkUrl: n.linkUrl,
    tag: n.tag,
    read: n.read,
    createdAt: n.createdAt,
  }));
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  ...initialNotificationRealtimeState,

  setNotificationUnread: (count) =>
    set({ notificationUnread: Math.max(0, count) }),
  setInboxUnread: (count) => set({ inboxUnread: Math.max(0, count) }),
  incrementNotification: () =>
    set((s) => ({ notificationUnread: s.notificationUnread + 1 })),
  incrementInbox: () => set((s) => ({ inboxUnread: s.inboxUnread + 1 })),
  setItems: (items) => set({ items: asItems(items) }),
  setLastSound: (decision) => set({ lastSound: decision }),

  applyEvent: (data, ctx) =>
    set((s) => applyRealtimeEvent(s, data, ctx)),

  clearThreadUnread: (threadId) =>
    set((s) => clearThreadUnreadState(s, threadId)),

  hydrateInboxThreads: (threads, activeThreadId) =>
    set((s) => hydrateInboxThreadsState(s, threads, activeThreadId)),

  replaceInboxThreads: (threads, activeThreadId) =>
    set((s) => replaceInboxThreadsState(s, threads, activeThreadId)),

  markItemReadLocal: (id) =>
    set((s) => markItemsReadState(s, (n) => n.id === id)),

  markAllReadLocal: () =>
    set((s) => ({
      ...s,
      items: s.items.map((n) => (n.read ? n : { ...n, read: true })),
      notificationUnread: 0,
      inboxUnread: 0,
      threadUnread: Object.fromEntries(
        Object.keys(s.threadUnread).map((id) => [id, 0]),
      ),
    })),

  requestInboxResync: () =>
    set((s) => ({ inboxResync: s.inboxResync + 1 })),

  reconcileCounts: (counts) =>
    set((s) => ({
      notificationUnread:
        typeof counts.unread === "number"
          ? Math.max(0, counts.unread)
          : s.notificationUnread,
      inboxUnread:
        typeof counts.inboxUnread === "number"
          ? Math.max(0, counts.inboxUnread)
          : s.inboxUnread,
    })),
}));
