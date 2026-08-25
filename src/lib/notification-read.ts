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

/** Inbox row id (`conv-…` / `project-…`) for a notification link, if any. */
export function inboxThreadIdFromLinkUrl(
  linkUrl: string | null | undefined,
): string | null {
  if (!linkUrl) return null;
  return inboxThreadIdsFromReadPayload({ linkUrls: [linkUrl] })[0] ?? null;
}

export function isInboxMessageLink(
  linkUrl: string | null | undefined,
): boolean {
  return inboxThreadIdFromLinkUrl(linkUrl) != null;
}

/** Thread id from a live `inbox` delta (covers older payloads that omit `threadId`). */
export function threadIdFromInboxDelta(payload: {
  threadId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}): string | null {
  if (payload.threadId) return payload.threadId;
  if (payload.conversationId) return `conv-${payload.conversationId}`;
  if (payload.projectId && !payload.taskId) return `project-${payload.projectId}`;
  return null;
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
