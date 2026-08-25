"use client";

import { useCallback, useEffect } from "react";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import {
  globalPresenceChannel,
  NOTIFICATION_SOUND_EVENT,
} from "@/lib/channels";
import { getActiveNotificationSoundUrl } from "@/actions/notification-sound-settings";
import { getMyNotificationPreferences } from "@/actions/notification-preferences";
import {
  primeNotificationAudio,
  setCustomNotificationSound,
  setNotificationSoundEnabled,
} from "@/lib/notification-sound";

interface Props {
  currentUserId?: string;
  soundUrl?: string | null;
}

/**
 * Keeps the custom sound URL + audio unlock ready. Playback itself is owned by
 * `NotificationRealtimeProvider` so a chime fires exactly once per
 * `notification.new`. Backgrounded/closed states are covered by OS push.
 */
export function NotificationSound({ soundUrl }: Props) {
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
    // Server-stored sound preference follows the user across devices; mirror it
    // into the localStorage fast-path used by playNotificationSound.
    getMyNotificationPreferences()
      .then((prefs) => setNotificationSoundEnabled(prefs.soundEnabled))
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

  return null;
}
