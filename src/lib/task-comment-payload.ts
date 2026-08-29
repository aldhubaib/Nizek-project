const PAYLOAD_PREFIX = "<!--task-comment:";

export type TaskCommentPayload = {
  taskId: string;
  projectId: string;
  projectName?: string;
  threadId?: string;
  taskTitle: string;
  quoteText?: string;
  comment: string;
};

export function encodeTaskCommentBody(
  payload: TaskCommentPayload,
  mentionTokens: string[],
): string {
  const header = mentionTokens.length ? `${mentionTokens.join(" ")}\n` : "";
  return `${header}${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeTaskCommentPayload(body: string): TaskCommentPayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  if (idx === -1) return null;
  const start = idx + PAYLOAD_PREFIX.length;
  const raw = body.slice(start);
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  try {
    return JSON.parse(raw.slice(0, end + 1)) as TaskCommentPayload;
  } catch {
    return null;
  }
}

export function isTaskCommentMessage(kind: string): boolean {
  return kind === "task_comment";
}

export function taskCommentUrl(
  projectId: string,
  taskId: string,
  threadId?: string,
): string {
  const base = `/dashboard/projects/${projectId}/tasks/${taskId}`;
  return threadId ? `${base}?threadId=${threadId}` : base;
}

export function taskCommentPreview(payload: TaskCommentPayload): string {
  const snippet = payload.comment.replace(/\s+/g, " ").trim().slice(0, 80);
  return snippet || `Comment on "${payload.taskTitle}"`;
}
