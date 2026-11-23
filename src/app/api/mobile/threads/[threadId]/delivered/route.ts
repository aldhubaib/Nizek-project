import { requireUser, isImpersonating } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/centrifugo";
import { recordThreadDelivered } from "@/lib/chat-delivery";
import { resolveThreadAccess } from "@/lib/chat-auth";
import { mobileRoute, parseThreadId } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * POST → acknowledge that messages in this thread reached the signed-in user's
 * device (realtime event or background sync), advancing their delivery cursor
 * without marking the thread read.
 */
export const POST = mobileRoute<{ threadId: string }>(async (_req, { threadId }) => {
  const user = await requireUser();
  const access = await resolveThreadAccess(user, parseThreadId(threadId));
  if (!access.allowed) throw new Error("Permission denied");
  if (await isImpersonating()) return { ok: true };
  await recordThreadDelivered(prisma, broadcast, { threadId, userIds: [user.id] });
  return { ok: true };
});
