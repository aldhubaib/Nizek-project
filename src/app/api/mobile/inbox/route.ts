import type { NextRequest } from "next/server";
import { getInboxChangesSince, getInboxThreads } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * GET /api/mobile/inbox            → full thread list
 * GET /api/mobile/inbox?since=ISO  → `{ threads: null }` when nothing changed
 */
export const GET = mobileRoute(async (req: NextRequest) => {
  const since = req.nextUrl.searchParams.get("since");
  if (since) {
    const changes = await getInboxChangesSince(since);
    return { threads: changes.threads, serverTime: changes.serverTime };
  }
  const threads = await getInboxThreads();
  return { threads, serverTime: new Date().toISOString() };
});
