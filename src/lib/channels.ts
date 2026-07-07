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
