import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getImpersonation } from "@/lib/auth";
import { readJsonCapped, upsertPushDevice } from "@/lib/push/device-state";
import { platformFromUserAgent, type PushPlatform } from "@/lib/push/device-report";
import { getStatusForEndpoint } from "@/lib/push/status-server";

export const runtime = "nodejs";

const SUBSCRIBE_MAX_BYTES = 8 * 1024;
const PLATFORMS = new Set(["ios", "android", "desktop"]);

/**
 * Legacy status probe (`GET /api/push?endpoint=`), kept for one release so
 * clients still running the previous bundle keep working. New clients call
 * GET /api/push/status.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    const status = await getStatusForEndpoint(user.id, endpoint, null);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 });
  }
}

/**
 * Register (or rotate) this device's push subscription.
 *
 * Body: { endpoint, keys, deviceId?, userAgent?, standalone?, platform?,
 *         oldEndpoint?, vapidKeyHash? }
 * When `oldEndpoint` differs from `endpoint` the old row is removed in the
 * same transaction — this is how pushsubscriptionchange and key rotation
 * avoid leaving dead rows behind until APNs/FCM returns 410.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // While an admin is viewing the app as another user, never register the
    // admin's browser as one of that user's push devices.
    if (await getImpersonation()) {
      return NextResponse.json({ ok: true, skipped: "impersonating" });
    }

    const parsed = await readJsonCapped(req, SUBSCRIBE_MAX_BYTES);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Invalid body" }, { status: parsed.status });
    }
    const b = (parsed.body ?? {}) as Record<string, unknown>;
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
    const keys = (b.keys ?? null) as { p256dh?: unknown; auth?: unknown } | null;

    if (
      !endpoint ||
      endpoint.length > 2048 ||
      !endpoint.startsWith("https://") ||
      typeof keys?.p256dh !== "string" ||
      typeof keys?.auth !== "string"
    ) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const deviceId =
      typeof b.deviceId === "string" && b.deviceId ? b.deviceId.slice(0, 128) : null;
    const userAgent =
      typeof b.userAgent === "string" && b.userAgent ? b.userAgent.slice(0, 512) : null;
    const standalone = typeof b.standalone === "boolean" ? b.standalone : null;
    const platform: PushPlatform | null =
      typeof b.platform === "string" && PLATFORMS.has(b.platform)
        ? (b.platform as PushPlatform)
        : platformFromUserAgent(userAgent);
    const oldEndpoint =
      typeof b.oldEndpoint === "string" && b.oldEndpoint && b.oldEndpoint !== endpoint
        ? b.oldEndpoint.slice(0, 2048)
        : null;
    const vapidKeyHash =
      typeof b.vapidKeyHash === "string" && b.vapidKeyHash
        ? b.vapidKeyHash.slice(0, 64)
        : null;

    const saved = await prisma.$transaction(async (tx) => {
      if (oldEndpoint) {
        await tx.pushSubscription.deleteMany({
          where: { endpoint: oldEndpoint, memberId: user.id },
        });
      }
      return tx.pushSubscription.upsert({
        where: { endpoint },
        create: {
          memberId: user.id,
          endpoint,
          p256dh: keys.p256dh as string,
          auth: keys.auth as string,
          deviceId,
          userAgent,
          standalone,
          platform,
          vapidKeyHash,
        },
        update: {
          memberId: user.id,
          p256dh: keys.p256dh as string,
          auth: keys.auth as string,
          // A fresh registration is proof the endpoint works again.
          failCount: 0,
          lastFailureAt: null,
          lastFailureStatus: null,
          // The SW's pushsubscriptionchange re-subscribe has no localStorage or
          // matchMedia, so it posts without these — keep existing metadata.
          ...(deviceId ? { deviceId } : {}),
          ...(userAgent ? { userAgent } : {}),
          ...(standalone === null ? {} : { standalone }),
          ...(platform ? { platform } : {}),
          ...(vapidKeyHash ? { vapidKeyHash } : {}),
        },
        select: { id: true },
      });
    });

    if (deviceId) {
      void upsertPushDevice(user.id, deviceId, {
        platform,
        standalone,
        permission: "granted",
        supportReason: null,
        hasSubscription: true,
        registered: true,
        enabled: true,
        lastReason: null,
        lastDetail: null,
        userAgent,
      }).catch(() => {});
    }

    // The client treats a missing subscriptionId as "not saved" — it is the
    // only proof the row exists, so it must always be echoed on success.
    return NextResponse.json({ ok: true, subscriptionId: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}

/**
 * Remove ONE endpoint. Used by the service worker when the push service
 * revokes a subscription and no replacement could be created. There is
 * deliberately no "remove all my devices" path: notifications are mandatory.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = await readJsonCapped(req, SUBSCRIBE_MAX_BYTES);
    const endpoint =
      parsed.ok && typeof (parsed.body as { endpoint?: unknown })?.endpoint === "string"
        ? ((parsed.body as { endpoint: string }).endpoint)
        : null;
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint, memberId: user.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
