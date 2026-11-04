import { NextRequest, NextResponse } from "next/server";
import { presignUploadPart } from "@/lib/r2";
import { MULTIPART_SIGN_BATCH_MAX } from "@/lib/upload-limits";
import {
  badRequest,
  isPartNumber,
  isUploadId,
  ownsUploadKey,
  readJson,
  requireUploadCaller,
} from "@/lib/upload-multipart-server";

export const runtime = "nodejs";

/**
 * Step 2: signed PUT links for a batch of part numbers. The browser asks for
 * only the parts it still has to send, so a resumed upload skips what landed.
 */
export async function POST(req: NextRequest) {
  const caller = await requireUploadCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = await readJson<{ key?: unknown; uploadId?: unknown; partNumbers?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON");
  if (!ownsUploadKey(caller.userId, body.key)) return badRequest("Invalid key");
  if (!isUploadId(body.uploadId)) return badRequest("Invalid uploadId");
  if (!Array.isArray(body.partNumbers) || body.partNumbers.length === 0) {
    return badRequest("Missing partNumbers");
  }
  if (body.partNumbers.length > MULTIPART_SIGN_BATCH_MAX) {
    return badRequest(`Ask for at most ${MULTIPART_SIGN_BATCH_MAX} parts per request`);
  }
  const partNumbers = [...new Set(body.partNumbers)];
  if (!partNumbers.every(isPartNumber)) return badRequest("Invalid part number");

  const key = body.key;
  const uploadId = body.uploadId;
  try {
    const urls: Record<number, string> = {};
    await Promise.all(
      partNumbers.map(async (n) => {
        urls[n] = await presignUploadPart(key, uploadId, n);
      }),
    );
    return NextResponse.json({ urls });
  } catch (err) {
    console.error("[multipart] sign error:", err);
    return NextResponse.json({ error: "Could not prepare upload parts" }, { status: 500 });
  }
}
