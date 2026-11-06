import type { NextRequest } from "next/server";
import { deleteMessage, editMessage } from "@/actions/messages";
import { mobileRoute, readJson, unwrap } from "@/lib/mobile/route";

export const runtime = "nodejs";

type Params = { messageId: string };

/** PATCH { body } → edit own message (24h window, enforced by the action). */
export const PATCH = mobileRoute<Params>(async (req: NextRequest, { messageId }) => {
  const input = await readJson<{ body: string }>(req);
  return unwrap(await editMessage(messageId, typeof input.body === "string" ? input.body : ""));
});

/** DELETE → soft-delete own message. */
export const DELETE = mobileRoute<Params>(async (_req, { messageId }) => {
  unwrap(await deleteMessage(messageId));
  return { ok: true };
});
