import { NextResponse } from "next/server";
import { brandingIconResponse } from "@/lib/branding-icon-route";
import { PWA_ICON_FILES } from "@/lib/pwa-icon-href";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ v: string; file: string }> },
) {
  const { v, file: rawFile } = await ctx.params;
  if (!/^\d+$/.test(v)) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
  const file = decodeURIComponent(rawFile);
  const def = PWA_ICON_FILES[file];
  if (!def) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
  return brandingIconResponse(
    req,
    def.slot,
    def.fallback,
    def.contentType,
    "immutable",
  );
}
