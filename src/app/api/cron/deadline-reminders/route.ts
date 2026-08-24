import { NextRequest, NextResponse } from "next/server";
import { processDeadlineReminders } from "@/lib/deadline-reminders";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_LOG_RETENTION_DAYS = 30;

async function prunePushDeliveryLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - DELIVERY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.pushDeliveryLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/** Daily cron: post deadline milestone reminders to project chat. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  if (auth !== `Bearer ${secret}` && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result, pruned] = await Promise.all([
      processDeadlineReminders(),
      prunePushDeliveryLogs().catch((err) => {
        console.error("PushDeliveryLog prune failed:", err);
        return 0;
      }),
    ]);
    return NextResponse.json({ ok: true, ...result, prunedDeliveryLogs: pruned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deadline reminders failed";
    console.error("deadline-reminders cron failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
