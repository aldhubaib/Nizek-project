import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { presignPutUrl, generateR2Key } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Issues a presigned PUT URL for a direct browser -> R2 upload. The server no
// longer proxies file bytes (removes the OOM risk from concurrent 50MB uploads).
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { filename?: string; contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType =
    typeof body.contentType === "string" && body.contentType
      ? body.contentType
      : "application/octet-stream";
  const size = typeof body.size === "number" ? body.size : 0;

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
  }

  try {
    const key = generateR2Key(`uploads/${userId}`, filename);
    const { uploadUrl, publicUrl } = await presignPutUrl(key, contentType);
    return NextResponse.json({ uploadUrl, url: publicUrl, key });
  } catch (err) {
    console.error("R2 presign error:", err);
    return NextResponse.json({ error: "Could not prepare upload" }, { status: 500 });
  }
}
