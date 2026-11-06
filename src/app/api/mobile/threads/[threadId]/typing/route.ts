import { publishTypingEvent } from "@/actions/messages";
import { conversationChannel, projectChannel, taskChannel } from "@/lib/channels";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** POST → "is typing…" for everyone else in the thread. Fire-and-forget. */
export const POST = mobileRoute<{ threadId: string }>(async (_req, { threadId }) => {
  const t = parseThreadId(threadId);
  const channel = t.conversationId
    ? conversationChannel(t.conversationId)
    : t.taskId
      ? taskChannel(t.taskId)
      : projectChannel(t.projectId!);
  await publishTypingEvent(channel);
  return { ok: true };
});
