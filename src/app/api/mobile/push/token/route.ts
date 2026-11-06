import { requireUser } from "@/lib/auth";
import { mobileRoute, readJson } from "@/lib/mobile/route";
import {
  parseRegisterTokenInput,
  registerMobilePushToken,
  unregisterMobilePushToken,
} from "@/lib/mobile/push-tokens";

export const runtime = "nodejs";

/**
 * POST { token, deviceId, platform, deviceName?, appVersion? }
 * Saves the phone's Expo push token for the signed-in person. The app calls
 * this on every launch and whenever the token changes, so a stale row heals
 * itself the next time the app opens.
 */
export const POST = mobileRoute(async (req) => {
  const user = await requireUser();
  const input = parseRegisterTokenInput(await readJson(req));
  await registerMobilePushToken(user.id, input);
  return { ok: true };
});

/**
 * DELETE { token?, deviceId? } — called before sign-out so the phone stops
 * getting this person's notifications.
 */
export const DELETE = mobileRoute(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ token?: string; deviceId?: string }>(req);
  const removed = await unregisterMobilePushToken(user.id, body);
  return { ok: true, removed };
});
