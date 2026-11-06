import type { NextRequest } from "next/server";
import { toggleReaction } from "@/actions/messages";
import { mobileRoute, readJson, unwrap } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** POST { emoji } → toggles the viewer's reaction; returns the new summary. */
export const POST = mobileRoute<{ messageId: string }>(async (req: NextRequest, { messageId }) => {
  const input = await readJson<{ emoji: string }>(req);
  return unwrap(await toggleReaction(messageId, typeof input.emoji === "string" ? input.emoji : ""));
});
