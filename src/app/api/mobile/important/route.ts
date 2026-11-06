import type { NextRequest } from "next/server";
import { listImportantMessages } from "@/actions/messages";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** GET [?thread=<threadId>] → the viewer's starred messages, newest first. */
export const GET = mobileRoute(async (req: NextRequest) => {
  const thread = req.nextUrl.searchParams.get("thread");
  const messages = await listImportantMessages(thread ? parseThreadId(thread) : undefined);
  return { messages };
});
