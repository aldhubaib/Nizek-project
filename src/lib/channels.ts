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

// Notification events published on a user's channel. The bell consumes these
// as payload-driven deltas (no refetch) and to keep read-state in sync across
// every device/tab the user has open.
export const NOTIFICATION_NEW = "notification.new";
export const NOTIFICATION_READ = "notification.read";
export const NOTIFICATION_READ_ALL = "notification.read-all";
