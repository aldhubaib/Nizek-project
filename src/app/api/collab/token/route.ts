import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Returns the session token for the current user so the client can pass it to
 * the Hocuspocus WebSocket connection. The token is extracted from the
 * better-auth session cookie.
 */
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie") ?? "";
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;

  if (!token) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
