// Centrifugo channel name helpers. Safe to import on client and server — these
// are just string builders and mirror the namespaces in centrifugo/config.json.

export function userChannel(memberId: string): string {
  // user-limited channel: the "#<memberId>" suffix restricts reads to its owner.
  return `user:${memberId}#${memberId}`;
}
export function taskChannel(taskId: string): string {
  return `task:${taskId}`;
}
export function projectChannel(projectId: string): string {
  return `project:${projectId}`;
}
export function conversationChannel(conversationId: string): string {
  return `conv:${conversationId}`;
}

/**
 * Client-facing twin of a conversation channel. A single channel cannot carry
 * both real and aliased names, so clients subscribe here instead and the server
 * publishes the masked payload. Same `conv` namespace, so Centrifugo config is
 * unchanged; the token route is what keeps each audience off the other's feed.
 */
export const CLIENT_CHANNEL_SUFFIX = "-client";

export function conversationClientChannel(conversationId: string): string {
  return `conv:${conversationId}${CLIENT_CHANNEL_SUFFIX}`;
}

/**
 * Splits the `conv:` channel body into the conversation it belongs to and the
 * audience it serves. Returns null for an empty id so a bare `conv:` or
 * `conv:-client` can never resolve to a real conversation.
 */
export function parseConversationChannel(
  rest: string,
): { conversationId: string; forClient: boolean } | null {
  const forClient = rest.endsWith(CLIENT_CHANNEL_SUFFIX);
  const conversationId = forClient
    ? rest.slice(0, -CLIENT_CHANNEL_SUFFIX.length)
    : rest;
  if (!conversationId) return null;
  return { conversationId, forClient };
}
/**
 * Namespaces whose payloads carry real staff names and photos — task and
 * project feeds are written for the team and are never masked.
 *
 * A client is a project member like anyone else, so a membership check alone
 * would let them subscribe. No client screen asks for these channels (the
 * thread page 404s a client on both kinds), so refusing outright costs nothing.
 */
const STAFF_ONLY_NAMESPACES = new Set(["project", "task"]);

export function isStaffOnlyChannel(channel: string): boolean {
  const idx = channel.indexOf(":");
  return STAFF_ONLY_NAMESPACES.has(idx === -1 ? channel : channel.slice(0, idx));
}

// Nizek has no workspace layer — one global presence channel keeps every
// signed-in user counted as online for the whole session.
export const GLOBAL_PRESENCE_ID = "global";
export function globalPresenceChannel(): string {
  return `presence:${GLOBAL_PRESENCE_ID}`;
}

// Event published on the global presence channel when an admin changes the
// custom notification sound, so open clients swap it live. Defined here (not in
// the "use server" action module, where only async functions may be exported).
export const NOTIFICATION_SOUND_EVENT = "notification-sound-changed";

/** Ephemeral presence on a chat channel. Not stored in history. */
export const TYPING_EVENT = "typing";

// Notification events published on a user's channel. The bell consumes these
// as payload-driven deltas (no refetch) and to keep read-state in sync across
// every device/tab the user has open.
export const NOTIFICATION_NEW = "notification.new";
export const NOTIFICATION_READ = "notification.read";
export const NOTIFICATION_READ_ALL = "notification.read-all";
