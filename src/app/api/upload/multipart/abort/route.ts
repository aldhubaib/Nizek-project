import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/r2";
import {
  badRequest,
  isUploadId,
  ownsUploadKey,
  readJson,
  requireUploadCaller,
} from "@/lib/upload-multipart-server";

export const runtime = "nodejs";

/**
 * The user discarded a failed send, so the parts already in R2 are garbage.
 * Best-effort: the daily cron aborts anything this misses.
 */
export async function POST(req: NextRequest) {
  const caller = await requireUploadCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = await readJson<{ key?: unknown; uploadId?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON");
  if (!ownsUploadKey(caller.userId, body.key)) return badRequest("Invalid key");
  if (!isUploadId(body.uploadId)) return badRequest("Invalid uploadId");

  try {
    await abortMultipartUpload(body.key, body.uploadId);
  } catch (err) {
    // Already aborted/completed or R2 hiccup — nothing for the caller to do.
    console.warn("[multipart] abort error:", err instanceof Error ? err.message : err);
  }
  return new NextResponse(null, { status: 204 });
}
