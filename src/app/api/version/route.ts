import { NextResponse } from "next/server";
import { getAppVersion, getAppLogoUrl } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const version = getAppVersion();
  return NextResponse.json(
    { version, logo: getAppLogoUrl(version) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
