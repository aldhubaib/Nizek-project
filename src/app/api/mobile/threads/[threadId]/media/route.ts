import { listThreadMedia } from "@/lib/mobile/thread-media";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** Paginated shared media/files for Chat Info. Newest first. */
export const GET = mobileRoute<{ threadId: string }>(async (req, { threadId }) => {
  const before = req.nextUrl.searchParams.get("before");
  const beforeId = req.nextUrl.searchParams.get("beforeId");
  const cursor =
    before && beforeId ? { before, beforeId } : null;
  return listThreadMedia(threadId, cursor);
});
