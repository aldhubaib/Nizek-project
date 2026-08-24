import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { presignPutUrl, generateR2Key } from "@/lib/r2";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

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
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_LABEL})` },
      { status: 400 },
    );
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
