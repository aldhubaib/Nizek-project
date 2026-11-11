import { getThreadMessages } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";
import { resolveMobileThreadMeta } from "@/lib/mobile/thread-meta";

export const runtime = "nodejs";

/** Thread header info + a page of messages. `?around=<messageId>` centers that page. */
export const GET = mobileRoute<{ threadId: string }>(async (req, { threadId }) => {
  const meta = await resolveMobileThreadMeta(threadId);
  const aroundId = req.nextUrl.searchParams.get("around") ?? undefined;
  const page = await getThreadMessages({ ...meta.target, aroundId });
  return { meta, page };
});
