import { NextResponse } from "next/server";
import { getAppLogoUrl, getClientVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [version, logo] = await Promise.all([
    getClientVersion(),
    getAppLogoUrl(),
  ]);
  return NextResponse.json(
    { version, logo },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
