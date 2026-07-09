import { NextResponse } from "next/server";

// Lightweight, unauthenticated liveness probe for Railway healthchecks.
// Intentionally does no auth/DB work so the deploy health signal is fast and reliable.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", ts: Date.now() },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
