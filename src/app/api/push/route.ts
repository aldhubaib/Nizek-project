import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getImpersonation } from "@/lib/auth";

/**
 * Whether a given endpoint is registered for the calling user. The client uses
 * this so the notifications toggle reflects the database rather than trusting
 * the browser's local subscription, which outlives server-side pruning.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const existing = await prisma.pushSubscription.findFirst({
      where: { endpoint, memberId: user.id },
      select: { id: true },
    });

    return NextResponse.json({
      registered: existing != null,
      subscriptionId: existing?.id ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to check subscription" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // While an admin is viewing the app as another user, never register the
    // admin's browser as one of that user's push devices — the member's
    // notifications would otherwise start arriving on the admin's machine.
    if (await getImpersonation()) {
      return NextResponse.json({ ok: true, skipped: "impersonating" });
    }

    const { endpoint, keys, deviceId, userAgent, standalone } = await req.json();

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const did = typeof deviceId === "string" && deviceId ? deviceId : null;
    const ua =
      typeof userAgent === "string" && userAgent ? userAgent.slice(0, 512) : null;
    const sa = typeof standalone === "boolean" ? standalone : null;

    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        memberId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceId: did,
        userAgent: ua,
        standalone: sa,
      },
      update: {
        memberId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        // The SW's pushsubscriptionchange re-subscribe can't read localStorage
        // or matchMedia, so it posts without these — keep existing metadata
        // instead of wiping it; the next app open backfills the rest via
        // syncPushSubscription.
        ...(did ? { deviceId: did } : {}),
        ...(ua ? { userAgent: ua } : {}),
        ...(sa === null ? {} : { standalone: sa }),
      },
      select: { id: true },
    });

    // The client treats a missing subscriptionId as "not saved" — it is the
    // only proof the row exists, so it must always be echoed on success.
    return NextResponse.json({ ok: true, subscriptionId: saved.id });
  } catch {
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const { endpoint } = await req.json().catch(() => ({}));

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint, memberId: user.id },
      });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { memberId: user.id } });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 },
    );
  }
}
