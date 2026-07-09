"use client";

import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { userChannel } from "@/lib/channels";
import { playNotificationSound } from "@/lib/notification-sound";

interface Props {
  currentUserId?: string;
}

/**
 * Plays a chime whenever a new notification lands on the user channel while the
 * app is open. Mounted once app-wide (including the inbox route, where the
 * notification bell is hidden) so coverage is consistent everywhere.
 */
export function NotificationSound({ currentUserId }: Props) {
  const cent = useCentrifugo();

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
