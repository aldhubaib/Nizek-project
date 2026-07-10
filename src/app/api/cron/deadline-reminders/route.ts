import { NextRequest, NextResponse } from "next/server";
import { processDeadlineReminders } from "@/lib/deadline-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await processDeadlineReminders();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
