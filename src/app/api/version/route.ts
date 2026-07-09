import { NextResponse } from "next/server";
import { getAppVersion, getAppLogoUrl, getClientVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const version = await getClientVersion();
  return NextResponse.json(
    { version, logo: getAppLogoUrl(getAppVersion()) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
