import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload, type MultipartPart } from "@/lib/r2";
import { MULTIPART_MAX_PARTS } from "@/lib/upload-limits";
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
 * Step 3: every part is in R2 — stitch them into the final object. R2 checks
 * the ETag of each part, so a corrupted or missing part fails here instead of
 * producing a broken file.
 */
export async function POST(req: NextRequest) {
  const caller = await requireUploadCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = await readJson<{ key?: unknown; uploadId?: unknown; parts?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON");
  if (!ownsUploadKey(caller.userId, body.key)) return badRequest("Invalid key");
  if (!isUploadId(body.uploadId)) return badRequest("Invalid uploadId");
  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    return badRequest("Missing parts");
  }
  if (body.parts.length > MULTIPART_MAX_PARTS) return badRequest("Too many parts");

  const parts: MultipartPart[] = [];
  for (const raw of body.parts as unknown[]) {
    const p = raw as { partNumber?: unknown; etag?: unknown };
    if (!isPartNumber(p?.partNumber)) return badRequest("Invalid part number");
    if (typeof p.etag !== "string" || !p.etag || p.etag.length > 256) {
      return badRequest("Invalid part etag");
    }
    parts.push({ partNumber: p.partNumber, etag: p.etag });
  }
  // Every part number 1..N must be present exactly once.
  const numbers = new Set(parts.map((p) => p.partNumber));
  if (numbers.size !== parts.length) return badRequest("Duplicate part number");
  for (let n = 1; n <= parts.length; n++) {
    if (!numbers.has(n)) return badRequest(`Part ${n} is missing`);
  }

  try {
    const url = await completeMultipartUpload(body.key, body.uploadId, parts);
    return NextResponse.json({ url, key: body.key });
  } catch (err) {
    console.error(
      "[multipart] complete error:",
      JSON.stringify({ key: body.key, parts: parts.length }),
      err,
    );
    return NextResponse.json({ error: "Could not finish upload" }, { status: 500 });
  }
}
