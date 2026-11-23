import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadToR2, generateR2Key } from "@/lib/r2";
import {
  MAX_PROXY_UPLOAD_BYTES,
  MAX_PROXY_UPLOAD_LABEL,
} from "@/lib/upload-limits";
import { validateUploadFile } from "@/lib/upload-validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

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

  const check = validateUploadFile({
    filename: file.name || "file",
    mimeType: file.type,
    fileSize: file.size,
    maxBytes: MAX_PROXY_UPLOAD_BYTES,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  try {
    const contentType = file.type || "application/octet-stream";
    const key = generateR2Key(`uploads/${userId}`, check.filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(buffer, key, contentType);
    return NextResponse.json({
      url,
      filename: check.filename,
      fileSize: file.size,
      mimeType: file.type || null,
      key,
    });
  } catch (err) {
    console.error("Upload proxy error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
