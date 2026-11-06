import { getThreadMessages } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";
import { resolveMobileThreadMeta } from "@/lib/mobile/thread-meta";

export const runtime = "nodejs";

/** Thread header info + the newest page of messages, in one round-trip. */
export const GET = mobileRoute<{ threadId: string }>(async (_req, { threadId }) => {
  const meta = await resolveMobileThreadMeta(threadId);
  const page = await getThreadMessages(meta.target);
  return { meta, page };
});
