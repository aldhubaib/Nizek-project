import { NextRequest, NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { setActiveThread } from "@/lib/active-thread";
import { readJsonCapped } from "@/lib/push/device-state";
import { isValidThreadKey } from "@/lib/push-core";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

/**
 * Heartbeat from an open, visible thread: `{ deviceId, threadKey }` every
 * ACTIVE_THREAD_HEARTBEAT_MS, and `{ deviceId, threadKey: null }` when the
 * thread is hidden or closed. The push worker skips this device for pushes
 * about that thread while the heartbeat is fresh.
 *
 * Keyed on the REAL signed-in user, not the impersonated one: the device (and
 * its push subscription) belongs to the person holding the phone, and an admin
 * using "view as" must never mute the other person's devices.
 */
export async function POST(req: NextRequest) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid body" }, { status: parsed.status });
  }
  const body = parsed.body as { deviceId?: unknown; threadKey?: unknown };

  const deviceId =
    typeof body.deviceId === "string" && /^[\w-]{1,128}$/.test(body.deviceId)
      ? body.deviceId
      : null;
  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
  }

  let threadKey: string | null;
  if (body.threadKey === null || body.threadKey === undefined) {
    threadKey = null;
  } else if (isValidThreadKey(body.threadKey)) {
    threadKey = body.threadKey;
  } else {
    return NextResponse.json({ error: "Invalid threadKey" }, { status: 400 });
  }

  await setActiveThread(user.id, deviceId, threadKey);
  return NextResponse.json({ ok: true });
}
