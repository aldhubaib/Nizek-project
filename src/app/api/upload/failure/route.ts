import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

// Upload failure telemetry. The client beacons here when an attachment upload
// finally fails (after retries/fallback), so server logs say WHY users' files
// aren't uploading — device, size, and the exact error — instead of us
// guessing from complaints. Log-only; nothing is stored.

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 204 });

  let data: unknown = null;
  try {
    data = await req.json();
  } catch {}
  const d = (data ?? {}) as {
    filename?: string;
    size?: number;
    type?: string | null;
    reason?: string;
    userAgent?: string;
  };
  console.error(
    "[upload-failure]",
    JSON.stringify({
      userId,
      filename: typeof d.filename === "string" ? d.filename.slice(0, 200) : null,
      size: typeof d.size === "number" ? d.size : null,
      type: typeof d.type === "string" ? d.type.slice(0, 100) : null,
      reason: typeof d.reason === "string" ? d.reason.slice(0, 500) : null,
      userAgent:
        typeof d.userAgent === "string" ? d.userAgent.slice(0, 300) : null,
    }),
  );
  return new NextResponse(null, { status: 204 });
}
