import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  getBrandingMapUncached,
  withBrandingBust,
} from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

/**
 * 302 to the live cache-busted branding object, or serve the static public
 * fallback. Never redirects to itself (the fallback path is this route).
 */
export async function brandingIconResponse(
  req: Request,
  slot: BrandingStorageSlot,
  fallbackFile: string,
  contentType: string,
): Promise<NextResponse> {
  const map = await getBrandingMapUncached();
  const entry = map[slot];
  if (entry) {
    const target = withBrandingBust(entry.url, entry.updatedAt);
    const url = /^https?:\/\//i.test(target)
      ? target
      : new URL(target, req.url).toString();
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  }

  try {
    const buf = await readFile(
      join(process.cwd(), "public", "branding-defaults", fallbackFile),
    );
    return new NextResponse(buf, {
      headers: { "Content-Type": contentType, ...NO_STORE },
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
}
