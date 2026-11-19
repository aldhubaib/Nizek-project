import type { NextRequest } from "next/server";
import { deleteMessage, editMessage } from "@/actions/messages";
import { mobileRoute, readJson, unwrap } from "@/lib/mobile/route";

export const runtime = "nodejs";

type Params = { messageId: string };

/** PATCH { body } → edit own message. There is no time limit. */
export const PATCH = mobileRoute<Params>(async (req: NextRequest, { messageId }) => {
  const input = await readJson<{ body: string }>(req);
  return unwrap(await editMessage(messageId, typeof input.body === "string" ? input.body : ""));
});

/** DELETE { scope: "me" | "everyone" } → hide for you, or remove it for the chat. */
export const DELETE = mobileRoute<Params>(async (req: NextRequest, { messageId }) => {
  const input = await readJson<{ scope?: string }>(req);
  const scope = input.scope === "me" ? "me" : "everyone";
  unwrap(await deleteMessage(messageId, scope));
  return { ok: true };
});
