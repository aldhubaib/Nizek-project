import { toggleImportantMessage } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** POST → star / unstar for the viewer only. Returns `{ important }`. */
export const POST = mobileRoute<{ messageId: string }>(async (_req, { messageId }) => {
  const result = await toggleImportantMessage(messageId);
  if (!result.ok) throw new Error(result.error);
  return { important: result.important };
});
