"use client";

import PusherClient from "pusher-js";

let pusherClient: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (typeof window === "undefined") return null;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) return null;

  if (!pusherClient) {
    pusherClient = new PusherClient(key, { cluster });
  }

  return pusherClient;
}

export function projectChannel(projectId: string) {
  return `project-${projectId}`;
}

export function userChannel(userId: string) {
  return `user-${userId}`;
}
