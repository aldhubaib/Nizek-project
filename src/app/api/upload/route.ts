import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadToR2, generateR2Key } from "@/lib/r2";
import {
  MAX_PROXY_UPLOAD_BYTES,
  MAX_PROXY_UPLOAD_LABEL,
} from "@/lib/upload-limits";

export const runtime = "nodejs";

// Same-origin upload fallback. The primary path is a presigned direct-to-R2 PUT
// (see lib/upload.ts), but cross-origin PUTs fail on some mobile browsers / PWAs
// (CORS preflight quirks). This route proxies the bytes through our own origin,
// which sidesteps CORS entirely. Kept for images/attachments (bounded size).

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_PROXY_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_PROXY_UPLOAD_LABEL})` },
      { status: 400 },
    );
  }

  try {
    const contentType = file.type || "application/octet-stream";
    const key = generateR2Key(`uploads/${userId}`, file.name || "file");
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(buffer, key, contentType);
    return NextResponse.json({
      url,
      filename: file.name || "file",
      fileSize: file.size,
      mimeType: file.type || null,
      key,
    });
  } catch (err) {
    console.error("Upload proxy error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
