import { requireUser } from "@/lib/auth";
import { setActiveThread } from "@/lib/active-thread";
import { isValidDeviceId } from "@/lib/mobile-push-core";
import { mobileRoute, readJson } from "@/lib/mobile/route";
import { isValidThreadKey } from "@/lib/push-core";

export const runtime = "nodejs";

/**
 * POST { deviceId, threadKey | null }
 * Heartbeat from the app while a chat is open on screen. The push worker skips
 * exactly this device for that chat, so the phone the person is reading on
 * never buzzes for the message they are looking at — other devices still do.
 * `threadKey: null` clears it (chat closed, app backgrounded).
 */
export const POST = mobileRoute(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ deviceId?: string; threadKey?: string | null }>(req);
  if (!isValidDeviceId(body.deviceId)) throw new Error("Invalid device id");
  const threadKey = body.threadKey == null ? null : body.threadKey;
  if (threadKey !== null && !isValidThreadKey(threadKey)) {
    throw new Error("Invalid thread key");
  }
  await setActiveThread(user.id, body.deviceId, threadKey);
  return { ok: true };
});
