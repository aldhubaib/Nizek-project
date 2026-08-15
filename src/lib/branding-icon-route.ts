import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getBrandingMapUncached } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

/**
 * Serve the live branding PNG/ICO as a same-origin 200.
 *
 * Chrome's WebAPK (the installed Android app) will not refresh the launcher
 * icon if the manifest points at a cross-origin URL or a 302. Proxy the
 * bytes so `/icon-192.png?v=<stamp>` is a real image on this origin.
 */
export async function brandingIconResponse(
  _req: Request,
  slot: BrandingStorageSlot,
  fallbackFile: string,
  contentType: string,
): Promise<NextResponse> {
  const map = await getBrandingMapUncached();
  const entry = map[slot];
  if (entry) {
    try {
      const upstream = await fetch(entry.url, { cache: "no-store", redirect: "follow" });
      if (upstream.ok) {
        const buf = await upstream.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") || contentType,
            "Cache-Control": "public, max-age=86400, must-revalidate",
          },
        });
      }
    } catch {
      // Fall through to the bundled default.
    }
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
