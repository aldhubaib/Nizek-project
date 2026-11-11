import { getOrCreateDirectConversation } from "@/actions/messages";
import { mobileRoute, readJson, unwrap } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** POST { memberId } → the 1:1 thread, creating it the first time. */
export const POST = mobileRoute(async (req) => {
  const body = await readJson<{ memberId: string }>(req);
  if (!body.memberId || typeof body.memberId !== "string") throw new Error("Invalid member");
  const threadId = unwrap(await getOrCreateDirectConversation(body.memberId));
  return { threadId };
});
