"use client";

import { useCallback, useEffect } from "react";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import {
  userChannel,
  globalPresenceChannel,
  NOTIFICATION_SOUND_EVENT,
} from "@/lib/channels";
import { getActiveNotificationSoundUrl } from "@/actions/notification-sound-settings";
import {
  playNotificationSound,
  primeNotificationAudio,
  setCustomNotificationSound,
} from "@/lib/notification-sound";

interface Props {
  currentUserId?: string;
  soundUrl?: string | null;
}

/**
 * Plays a chime whenever a new notification lands on the user channel while the
 * app is open. Mounted once app-wide (including the inbox route, where the
 * notification bell is hidden) so coverage is consistent everywhere.
 */
export function NotificationSound({ currentUserId, soundUrl }: Props) {
  const cent = useCentrifugo();

  // Seed with the server-rendered URL immediately so the first notification uses
  // the right sound even before the fresh refetch below resolves.
  useEffect(() => {
    setCustomNotificationSound(soundUrl ?? null);
  }, [soundUrl]);

  // Fresh read on mount + whenever the tab regains focus. This defeats stale
  // per-replica caching and stale already-open sessions: everyone converges to
  // the current sound without needing a full reload.
  const refresh = useCallback(() => {
    getActiveNotificationSoundUrl()
      .then((url) => setCustomNotificationSound(url))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Unlock audio on the first interaction so later notifications can chime.
  useEffect(() => {
    primeNotificationAudio();
  }, []);

  // Instant push: when an admin changes the sound, swap it live for everyone.
  useChannel(cent ? globalPresenceChannel() : null, (data) => {
    const payload = data as { type?: string; url?: string | null } | null;
    if (!payload || payload.type !== NOTIFICATION_SOUND_EVENT) return;
    setCustomNotificationSound(payload.url ?? null);
  });

  useChannel(
    cent && currentUserId ? userChannel(currentUserId) : null,
    (data) => {
      const payload = data as { type?: string; authorId?: string } | null;
      if (!payload || typeof payload !== "object") return;
      // Don't chime for our own outgoing messages (the inbox delta is broadcast
      // back to the author too so their sidebar updates).
      if (payload.type === "inbox" && payload.authorId === currentUserId) return;
      playNotificationSound();
    },
  );

  return null;
}
