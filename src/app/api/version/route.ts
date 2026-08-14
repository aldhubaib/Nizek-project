import { NextResponse } from "next/server";
import { getLiveLogos } from "@/lib/branding";
import { getClientRelease } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [release, logos] = await Promise.all([
    getClientRelease(),
    getLiveLogos(),
  ]);
  return NextResponse.json(
    {
      version: release.version,
      releasedAt: release.releasedAt,
      logo: logos.favicon,
      logos,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
