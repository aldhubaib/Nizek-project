"use client";

import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import {
  userChannel,
  NOTIFICATION_READ,
  NOTIFICATION_READ_ALL,
} from "@/lib/channels";
import { updateAppBadge } from "@/lib/app-badge";
import { closePushBannersByTags } from "@/lib/close-push-banners";

interface Props {
  currentUserId?: string;
}

/**
 * Cross-device notification hygiene, mounted once app-wide (unlike the bell,
 * which unmounts on the inbox route). When notifications are read anywhere —
 * this tab, another tab, another device — every open client closes the
 * matching OS push banners by tag and re-syncs the app-icon badge, so a
 * message read on the phone stops staring at you from the laptop.
 */
export function NotificationSync({ currentUserId }: Props) {
  const cent = useCentrifugo();

  useChannel(
    cent && currentUserId ? userChannel(currentUserId) : null,
    (data) => {
      const payload = data as
        | { type?: string; tags?: string[]; unread?: number }
        | null;
      if (!payload || typeof payload !== "object") return;

      if (
        payload.type === NOTIFICATION_READ ||
        payload.type === NOTIFICATION_READ_ALL
      ) {
        void closePushBannersByTags(payload.tags ?? []);
        if (typeof payload.unread === "number") {
          updateAppBadge(Math.max(0, payload.unread));
        }
      }
    },
  );

  return null;
}
