/**
 * Inbox row ids (`conv-…` / `project-…`) referenced by a notification.read
 * payload, so the conversation list can drop unread badges without a refetch.
 */
export function inboxThreadIdsFromReadPayload(payload: {
  tags?: string[] | null;
  linkUrls?: string[] | null;
}): string[] {
  const ids = new Set<string>();
  for (const tag of payload.tags ?? []) {
    if (tag.startsWith("thread-conv-") || tag.startsWith("thread-project-")) {
      ids.add(tag.slice("thread-".length));
    }
  }
  for (const url of payload.linkUrls ?? []) {
    const path = (url.startsWith("http") ? safePathname(url) : url)
      .split("?")[0]
      .replace(/\/$/, "");
    const match = path.match(
      /\/dashboard\/messages\/((?:conv|project)-[^/]+)$/,
    );
    if (match) ids.add(match[1]);
  }
  return [...ids];
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Push tag used for a chat/task thread (`thread-conv-…`, `thread-project-…`, `thread-task-…`). */
export function threadPushTag(target: {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
}): string | null {
  if (target.conversationId) return `thread-conv-${target.conversationId}`;
  if (target.taskId) return `thread-task-${target.taskId}`;
  if (target.projectId) return `thread-project-${target.projectId}`;
  return null;
}
