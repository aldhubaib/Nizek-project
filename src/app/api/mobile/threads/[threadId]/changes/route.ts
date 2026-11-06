import type { NextRequest } from "next/server";
import { getThreadChangesSince } from "@/actions/messages";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * GET ?since=ISO → new / edited / reacted / deleted messages after `since`.
 * The app calls this after the socket was asleep (app came back to the
 * foreground, reconnect) instead of reloading the whole thread.
 */
export const GET = mobileRoute<{ threadId: string }>(async (req: NextRequest, { threadId }) => {
  const since = req.nextUrl.searchParams.get("since");
  if (!since) throw new Error("Invalid cursor");
  return getThreadChangesSince(parseThreadId(threadId), since);
});
