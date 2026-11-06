import { markThreadRead } from "@/actions/messages";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";
import { resolveMobileThreadMeta } from "@/lib/mobile/thread-meta";

export const runtime = "nodejs";

/**
 * POST → mark the thread read for the signed-in user (unread badges, read
 * receipts for the people who wrote). Only called by the app while the thread
 * is actually on screen.
 */
export const POST = mobileRoute<{ threadId: string }>(async (_req, { threadId }) => {
  const parsed = parseThreadId(threadId);
  // Task threads need the project id on the target for the notification link.
  const target = parsed.taskId
    ? (await resolveMobileThreadMeta(threadId)).target
    : parsed;
  const counts = await markThreadRead(target);
  return counts ?? { unread: null, inboxUnread: null };
});
