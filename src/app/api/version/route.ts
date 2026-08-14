import { NextResponse } from "next/server";
import { getAppLogoUrl, getClientRelease } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [release, logo] = await Promise.all([
    getClientRelease(),
    getAppLogoUrl(),
  ]);
  return NextResponse.json(
    { version: release.version, releasedAt: release.releasedAt, logo },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
