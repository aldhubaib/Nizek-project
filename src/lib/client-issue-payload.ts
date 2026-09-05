import { TASK_TYPE_BADGE, taskCode } from "@/lib/task-label";

const PAYLOAD_PREFIX = "<!--client-issue:";

/** An issue a client raised, as it travels on a chat message. */
export type ClientIssuePayload = {
  taskId: string;
  taskNumber: number;
  projectId: string;
  projectName?: string;
  taskType: string;
  title: string;
  /** First text answer, so the card says something without opening the task. */
  excerpt?: string;
};

export function clientIssueTypeLabel(taskType: string): string {
  return TASK_TYPE_BADGE[taskType]?.label ?? "Issue";
}

export function encodeClientIssueBody(payload: ClientIssuePayload): string {
  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeClientIssuePayload(body: string): ClientIssuePayload | null {
  const idx = body.indexOf(PAYLOAD_PREFIX);
  if (idx === -1) return null;
  const raw = body.slice(idx + PAYLOAD_PREFIX.length);
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  try {
    return JSON.parse(raw.slice(0, end + 1)) as ClientIssuePayload;
  } catch {
    return null;
  }
}

export function isClientIssueMessage(kind: string): boolean {
  return kind === "client_issue";
}

/** What the inbox and a push notification show in one line. */
export function clientIssuePreview(payload: ClientIssuePayload): string {
  return `${taskCode(payload.taskType, payload.taskNumber)} · ${payload.title}`;
}
