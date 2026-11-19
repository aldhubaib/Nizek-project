import { searchFiles, searchMessages } from "@/actions/message-search";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * GET ?q= → chats are filtered on the phone. This returns files, then the
 * route's messages, in rooms this person can open.
 * `before` pages messages. `fileBefore` pages files. One cursor at a time.
 */
export const GET = mobileRoute(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const before = req.nextUrl.searchParams.get("before");
  const beforeId = req.nextUrl.searchParams.get("beforeId");
  const fileBefore = req.nextUrl.searchParams.get("fileBefore");
  const fileBeforeId = req.nextUrl.searchParams.get("fileBeforeId");
  const threadKey = req.nextUrl.searchParams.get("thread");
  const thread = threadKey ? parseThreadId(threadKey) : undefined;
  const pagingMessages = Boolean(before && beforeId);
  const pagingFiles = Boolean(fileBefore && fileBeforeId) && !thread;

  if (pagingMessages && !pagingFiles) {
    const messages = await searchMessages({ q, before, beforeId, thread });
    return { ...messages, files: [], filesHasMore: false };
  }
  if (pagingFiles && !pagingMessages) {
    const files = await searchFiles({ q, before: fileBefore, beforeId: fileBeforeId });
    return { messages: [], hasMore: false, ...files };
  }

  const messages = await searchMessages({ q, thread });
  if (thread) return { ...messages, files: [], filesHasMore: false };
  const files = await searchFiles({ q });
  return { ...messages, ...files };
});
