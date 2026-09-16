import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStatusForEndpoint } from "@/lib/push/status-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/status?endpoint=&deviceId=
 * The single network round-trip the client makes per foreground.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (endpoint && endpoint.length > 2048) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }
    const status = await getStatusForEndpoint(
      user.id,
      endpoint || null,
      deviceId ? deviceId.slice(0, 128) : null,
    );
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 });
  }
}
