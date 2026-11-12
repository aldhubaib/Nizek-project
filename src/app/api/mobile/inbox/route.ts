import type { NextRequest } from "next/server";
import { getInboxChangesSince, getInboxThreads, type InboxThread } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** Note comment threads stay on the panel. The phone does not treat them as chats. */
export function mobileInboxThreads(threads: InboxThread[] | null): InboxThread[] | null {
  if (!threads) return null;
  return threads.filter((thread) => !thread.noteComment);
}

/**
 * GET /api/mobile/inbox            → full thread list
 * GET /api/mobile/inbox?since=ISO  → `{ threads: null }` when nothing changed
 */
export const GET = mobileRoute(async (req: NextRequest) => {
  const since = req.nextUrl.searchParams.get("since");
  if (since) {
    const changes = await getInboxChangesSince(since);
    return { threads: mobileInboxThreads(changes.threads), serverTime: changes.serverTime };
  }
  const threads = await getInboxThreads();
  return { threads: mobileInboxThreads(threads), serverTime: new Date().toISOString() };
});
