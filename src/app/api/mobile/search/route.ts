import { searchFiles, searchMessages } from "@/actions/message-search";
import { mobileRoute } from "@/lib/mobile/route";

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
  const pagingMessages = Boolean(before && beforeId);
  const pagingFiles = Boolean(fileBefore && fileBeforeId);

  if (pagingMessages && !pagingFiles) {
    const messages = await searchMessages({ q, before, beforeId });
    return { ...messages, files: [], filesHasMore: false };
  }
  if (pagingFiles && !pagingMessages) {
    const files = await searchFiles({ q, before: fileBefore, beforeId: fileBeforeId });
    return { messages: [], hasMore: false, ...files };
  }

  const [messages, files] = await Promise.all([
    searchMessages({ q }),
    searchFiles({ q }),
  ]);
  return { ...messages, ...files };
});
