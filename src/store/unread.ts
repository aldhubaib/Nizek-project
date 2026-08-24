import { create } from "zustand";

interface UnreadState {
  notificationUnread: number;
  inboxUnread: number;
  setNotificationUnread: (count: number) => void;
  setInboxUnread: (count: number) => void;
  incrementNotification: () => void;
  incrementInbox: () => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  notificationUnread: 0,
  inboxUnread: 0,
  setNotificationUnread: (count) => set({ notificationUnread: Math.max(0, count) }),
  setInboxUnread: (count) => set({ inboxUnread: Math.max(0, count) }),
  incrementNotification: () => set((s) => ({ notificationUnread: s.notificationUnread + 1 })),
  incrementInbox: () => set((s) => ({ inboxUnread: s.inboxUnread + 1 })),
}));
