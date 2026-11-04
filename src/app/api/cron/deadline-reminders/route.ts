import { NextRequest, NextResponse } from "next/server";
import { processDeadlineReminders } from "@/lib/deadline-reminders";
import { prisma } from "@/lib/prisma";
import { OUTBOX_RETENTION_MS } from "@/lib/push/outbox-core";
import { abortMultipartUpload, listStaleMultipartUploads } from "@/lib/r2";
import { MESSAGE_EVENT_RETENTION_MS } from "@/lib/message-events-core";

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

/**
 * Dispatched outbox rows are kept for a day for debugging, then dropped.
 * Undispatched rows are never pruned here — the worker's sweep owns them.
 */
async function prunePushOutbox(): Promise<number> {
  const cutoff = new Date(Date.now() - OUTBOX_RETENTION_MS);
  const { count } = await prisma.pushOutbox.deleteMany({
    where: { dispatchedAt: { not: null, lt: cutoff } },
  });
  return count;
}

/** Delivered chat events are kept a day for debugging, then dropped. */
async function pruneMessageEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - MESSAGE_EVENT_RETENTION_MS);
  const { count } = await prisma.messageEvent.deleteMany({
    where: { processedAt: { not: null, lt: cutoff } },
  });
  return count;
}

/**
 * Multipart uploads that were started but never completed or aborted (tab
 * killed, message discarded offline) keep their parts in R2 as billed
 * storage. Anything older than a day is not coming back — abort it.
 */
const STALE_MULTIPART_MS = 24 * 60 * 60 * 1000;

async function abortStaleMultipartUploads(): Promise<number> {
  const stale = await listStaleMultipartUploads(STALE_MULTIPART_MS);
  let aborted = 0;
  for (const u of stale) {
    try {
      await abortMultipartUpload(u.key, u.uploadId);
      aborted++;
    } catch (err) {
      console.error("[multipart] cron abort failed:", u.key, err);
    }
  }
  return aborted;
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
    const [result, pruned, prunedOutbox, abortedUploads, prunedEvents] = await Promise.all([
      processDeadlineReminders(),
      prunePushDeliveryLogs().catch((err) => {
        console.error("PushDeliveryLog prune failed:", err);
        return 0;
      }),
      prunePushOutbox().catch((err) => {
        console.error("PushOutbox prune failed:", err);
        return 0;
      }),
      abortStaleMultipartUploads().catch((err) => {
        console.error("Stale multipart abort failed:", err);
        return 0;
      }),
      pruneMessageEvents().catch((err) => {
        console.error("MessageEvent prune failed:", err);
        return 0;
      }),
    ]);
    return NextResponse.json({
      ok: true,
      ...result,
      prunedDeliveryLogs: pruned,
      prunedOutbox,
      abortedUploads,
      prunedEvents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deadline reminders failed";
    console.error("deadline-reminders cron failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
