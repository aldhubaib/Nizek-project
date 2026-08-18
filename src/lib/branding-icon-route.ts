import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getBrandingMapUncached } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

const NO_STORE = "no-store, max-age=0, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";

export type BrandingIconCache = "no-store" | "immutable";

/**
 * Serve the live branding PNG/ICO as a same-origin 200.
 *
 * Chrome's WebAPK (the installed Android app) will not refresh the launcher
 * icon if the manifest points at a cross-origin URL or a 302. Proxy the
 * bytes so `/pwa-icons/<stamp>/icon-192.png` is a real image on this origin.
 */
export async function brandingIconResponse(
  _req: Request,
  slot: BrandingStorageSlot,
  fallbackFile: string,
  contentType: string,
  cache: BrandingIconCache = "no-store",
): Promise<NextResponse> {
  const cacheControl = cache === "immutable" ? IMMUTABLE : NO_STORE;
  const map = await getBrandingMapUncached();
  const entry = map[slot];
  if (entry) {
    try {
      const upstream = await fetch(entry.url, {
        cache: "no-store",
        redirect: "follow",
      });
      if (upstream.ok) {
        const buf = await upstream.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type":
              upstream.headers.get("content-type") || contentType,
            "Cache-Control": cacheControl,
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
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  } catch {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": NO_STORE },
    });
  }
}
