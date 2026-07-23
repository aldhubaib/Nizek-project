import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, getImpersonation } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // While an admin is viewing the app as another user, never register the
    // admin's browser as one of that user's push devices — the member's
    // notifications would otherwise start arriving on the admin's machine.
    if (await getImpersonation()) {
      return NextResponse.json({ ok: true, skipped: "impersonating" });
    }

    const { endpoint, keys, deviceId, userAgent } = await req.json();

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const did = typeof deviceId === "string" && deviceId ? deviceId : null;
    const ua =
      typeof userAgent === "string" && userAgent ? userAgent.slice(0, 512) : null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        memberId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceId: did,
        userAgent: ua,
      },
      update: {
        memberId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceId: did,
        userAgent: ua,
      },
    });

    return NextResponse.json({ ok: true });
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
