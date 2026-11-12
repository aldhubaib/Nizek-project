import { markThreadUnread } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * POST → flag this chat unread for the signed-in user only.
 * Does not move the read cursor and does not tell the other person.
 */
export const POST = mobileRoute<{ threadId: string }>(async (_req, { threadId }) => {
  await markThreadUnread(threadId);
  return { ok: true };
});
