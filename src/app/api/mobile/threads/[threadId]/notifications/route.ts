import { setThreadNotificationLevel } from "@/actions/notification-preferences";
import { isThreadNotificationLevel } from "@/lib/notification-prefs";
import { mobileRoute, readJson } from "@/lib/mobile/route";
import { resolveMobileThreadMeta } from "@/lib/mobile/thread-meta";

export const runtime = "nodejs";

/**
 * PUT { level: "all" | "mentions" | "none" }. Choosing All drops the stored
 * row, because All is the default. The thread must be one this person can open.
 */
export const PUT = mobileRoute<{ threadId: string }>(async (req, { threadId }) => {
  await resolveMobileThreadMeta(threadId);
  const body = await readJson<{ level?: string }>(req);
  if (!isThreadNotificationLevel(body.level)) throw new Error("Invalid level");
  return setThreadNotificationLevel(threadId, body.level);
});
