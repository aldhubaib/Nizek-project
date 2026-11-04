import { NextRequest, NextResponse } from "next/server";
import { createMultipartUpload, generateR2Key } from "@/lib/r2";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_BYTES,
} from "@/lib/upload-limits";
import {
  badRequest,
  readJson,
  requireUploadCaller,
} from "@/lib/upload-multipart-server";

export const runtime = "nodejs";

/**
 * Step 1 of a resumable upload: mint the object key and start the multipart
 * upload in R2. Returns what the browser needs to ask for part links.
 */
export async function POST(req: NextRequest) {
  const caller = await requireUploadCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = await readJson<{ filename?: unknown; contentType?: unknown; size?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON");

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const contentType =
    typeof body.contentType === "string" && body.contentType
      ? body.contentType
      : "application/octet-stream";
  const size = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : 0;

  if (!filename) return badRequest("Missing filename");
  if (size <= 0) return badRequest("Missing file size");
  if (size > MAX_UPLOAD_BYTES) {
    return badRequest(`File too large (max ${MAX_UPLOAD_LABEL})`);
  }
  const partCount = Math.ceil(size / MULTIPART_PART_BYTES);
  if (partCount > MULTIPART_MAX_PARTS) {
    return badRequest("File has too many parts for a multipart upload");
  }

  try {
    const key = generateR2Key(`uploads/${caller.userId}`, filename);
    const { uploadId, publicUrl } = await createMultipartUpload(key, contentType);
    return NextResponse.json({
      key,
      uploadId,
      url: publicUrl,
      partSize: MULTIPART_PART_BYTES,
      partCount,
    });
  } catch (err) {
    console.error("[multipart] create error:", err);
    return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
  }
}
