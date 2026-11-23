import type { NextRequest } from "next/server";
import { getInboxChangesSince, getInboxThreads, type InboxThread } from "@/actions/messages";
import { requireUser, isImpersonating } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/centrifugo";
import { recordThreadDelivered } from "@/lib/chat-delivery";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** Note comment threads stay on the panel. The phone does not treat them as chats. */
export function mobileInboxThreads(threads: InboxThread[] | null): InboxThread[] | null {
  if (!threads) return null;
  return threads.filter((thread) => !thread.noteComment);
}

function markUnreadDelivered(threads: InboxThread[] | null) {
  if (!threads) return;
  const unreadIds = threads.filter((t) => t.unread > 0).map((t) => t.id);
  if (unreadIds.length === 0) return;
  void (async () => {
    try {
      if (await isImpersonating()) return;
      const user = await requireUser();
      const now = new Date();
      await Promise.all(
        unreadIds.map((threadId) =>
          recordThreadDelivered(prisma, broadcast, { threadId, userIds: [user.id], at: now }),
        ),
      );
    } catch {
      // Delivery acks never affect inbox responses.
    }
  })();
}

/**
 * GET /api/mobile/inbox            → full thread list
 * GET /api/mobile/inbox?since=ISO  → `{ threads: null }` when nothing changed
 */
export const GET = mobileRoute(async (req: NextRequest) => {
  const since = req.nextUrl.searchParams.get("since");
  if (since) {
    const changes = await getInboxChangesSince(since);
    const filtered = mobileInboxThreads(changes.threads);
    markUnreadDelivered(filtered);
    return { threads: filtered, serverTime: changes.serverTime };
  }
  const threads = await getInboxThreads();
  const filtered = mobileInboxThreads(threads);
  markUnreadDelivered(filtered);
  return { threads: filtered, serverTime: new Date().toISOString() };
});
