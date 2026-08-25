"use client";

/**
 * Cross-device banner/badge sync now lives in `NotificationRealtimeProvider`
 * (one user-channel subscriber). This module is kept so older imports don't
 * break; it no longer subscribes on its own.
 */
export function NotificationSync(_props: { currentUserId?: string }) {
  return null;
}
