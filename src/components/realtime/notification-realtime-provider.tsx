"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { userChannel, NOTIFICATION_NEW, NOTIFICATION_READ, NOTIFICATION_READ_ALL } from "@/lib/channels";
import { getUnreadCount } from "@/actions/notifications";
import { getInboxUnreadCount } from "@/actions/messages";
import { updateAppBadge } from "@/lib/app-badge";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import {
  playNotificationSound,
  isNotificationSoundEnabled,
} from "@/lib/notification-sound";
import {
  decideNotificationSound,
  type SoundEventPayload,
} from "@/lib/notification-sound-policy";
import { useNotificationStore } from "@/store/notifications";

const POLL_FALLBACK_INTERVAL = 60_000;

interface Props {
  currentUserId?: string;
  children?: ReactNode;
}

/**
 * Single subscriber for `userChannel(currentUserId)`. Writes unread + inbox
 * + thread preview state into the shared store, plays the in-app chime, and
 * keeps the OS app-icon badge / push banners in sync. Nav and inbox
 * list only read from the store.
 */
export function NotificationRealtimeProvider({
  currentUserId,
  children,
}: Props) {
  const cent = useCentrifugo();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  const notificationUnread = useNotificationStore((s) => s.notificationUnread);
  const applyEvent = useNotificationStore((s) => s.applyEvent);
  const setNotificationUnread = useNotificationStore((s) => s.setNotificationUnread);
  const setInboxUnread = useNotificationStore((s) => s.setInboxUnread);
  const setLastSound = useNotificationStore((s) => s.setLastSound);
  const requestInboxResync = useNotificationStore((s) => s.requestInboxResync);

  useEffect(() => {
    updateAppBadge(notificationUnread);
  }, [notificationUnread]);

  const seedCounts = useCallback(() => {
    getUnreadCount()
      .then(setNotificationUnread)
      .catch(() => {});
    getInboxUnreadCount()
      .then(setInboxUnread)
      .catch(() => {});
  }, [setNotificationUnread, setInboxUnread]);

  const seedAll = useCallback(() => {
    Promise.all([getUnreadCount(), getInboxUnreadCount()])
      .then(([unread, inboxUnread]) => {
        setNotificationUnread(unread);
        setInboxUnread(inboxUnread);
      })
      .catch(() => {});
  }, [setNotificationUnread, setInboxUnread]);

  useEffect(() => {
    seedCounts();
    if (cent?.enabled) return;
    const id = setInterval(seedCounts, POLL_FALLBACK_INTERVAL);
    return () => clearInterval(id);
  }, [seedCounts, cent?.enabled]);

  const wasConnected = useRef(false);
  useEffect(() => {
    const now = Boolean(cent?.connected);
    if (now && !wasConnected.current) {
      seedAll();
    }
    wasConnected.current = now;
  }, [cent?.connected, seedAll]);

  useEffect(() => {
    const reconcile = () => {
      if (document.hidden) return;
      seedCounts();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [seedCounts]);

  useChannel(
    cent && currentUserId ? userChannel(currentUserId) : null,
    (data) => {
      const payload = data as
        | {
            type?: string;
            tags?: string[];
            unread?: number;
          }
        | SoundEventPayload
        | null;
      if (!payload || typeof payload !== "object") return;

      applyEvent(payload, {
        currentUserId: userIdRef.current,
        pathname: pathnameRef.current,
      });

      if (
        payload.type === NOTIFICATION_READ ||
        payload.type === NOTIFICATION_READ_ALL
      ) {
        const tags = (payload as { tags?: string[] }).tags ?? [];
        if (tags.length > 0) void closePushBannersByTags(tags);
        if (typeof (payload as { unread?: number }).unread === "number") {
          updateAppBadge(Math.max(0, (payload as { unread: number }).unread));
        }
      }

      if (payload.type !== NOTIFICATION_NEW) return;

      const decision = decideNotificationSound(payload as SoundEventPayload, {
        currentUserId: userIdRef.current,
        appFocused:
          document.visibilityState === "visible" && document.hasFocus(),
        pathname: pathnameRef.current,
        soundEnabled: isNotificationSoundEnabled(),
      });
      setLastSound({
        played: decision.play,
        reason: decision.reason,
        at: Date.now(),
        linkUrl: (payload as SoundEventPayload).notification?.linkUrl ?? null,
      });
      if (decision.play) playNotificationSound();
    },
    () => {
      seedAll();
      requestInboxResync();
    },
  );

  return children ?? null;
}
